import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { WhatsAppService } from '../../../../core/services/whatsapp';
import { Toast } from '../../../../core/services/toast';
import { esCelularChileno, MENSAJE_TELEFONO_INVALIDO } from '../../../../core/utils/phone';
import type { EncargadoAdmin, EstadoTerritorioAdmin, ManzanaFeature, SalidaRegistrada } from '../../admin.models';
import { CorreccionMap, type CalleVisible } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { diaLocal } from '../../utils/analytics';
import { clave, quitarZonaEnSalida, situacion, vaciar, zonasDeLaBase, type EstadoCorreccion } from '../../utils/correccion';
import { fmtFecha, fmtFechaHora, fmtTelefono } from '../../utils/formato';
import {
  alternarCalle,
  alternarEntera,
  aporte,
  baseDeRegistro,
  callesDe,
  hermanoEscrito,
  ladosDe,
  pedidoRegistro,
  resultado,
  todoElTerritorio,
  type Hermano,
} from '../../utils/registro';

type Modo = 'entera' | 'calles';
type Turno = 'mañana' | 'tarde';

/** "Pedro Soto" sin tildes ni mayúsculas, para reconocer a un encargado escrito a mano. */
export function claveHermano(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** El encargado de la lista que se llama así, o un hermano escrito a mano (sin cuenta). */
export function resolverHermano(texto: string, encargados: Pick<EncargadoAdmin, 'id' | 'nombre' | 'apellido'>[]): Hermano {
  const k = claveHermano(texto);
  const e = encargados.find(x => claveHermano(`${x.nombre} ${x.apellido}`) === k);
  return e ? { id: e.id, nombre: e.nombre, apellido: e.apellido } : hermanoEscrito(texto);
}

/** "2026-11-07" → "07-11-2026" (como lo muestra el WhatsApp). */
export function fechaParaWhatsApp(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a}`;
}

interface Registrado {
  salida: SalidaRegistrada;
  hermano: string;
  dia: string;
  turno: Turno;
  whatsapp: 'enviado' | 'fallo' | 'no';
}

/**
 * Registrar una salida que un hermano informó (p. ej. por WhatsApp), mientras
 * los hermanos aprenden a usar la app. Queda como salida de él: suma al
 * territorio, sale en el S-13 y en Reportes. El resumen le llega por WhatsApp
 * al administrador.
 */
@Component({
  selector: 'app-registrar',
  imports: [CorreccionMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './registrar.html',
  styleUrl: './registrar.css',
})
export class RegistrarPage {
  protected readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);
  private readonly whatsapp = inject(WhatsAppService);
  private readonly mapa = viewChild(CorreccionMap);

  protected readonly hoy = diaLocal(new Date());
  protected readonly ayer = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return diaLocal(d);
  })();

  // Datos de la salida
  protected readonly hermanoTexto = signal('');
  protected readonly dia = signal(this.hoy);
  protected readonly turno = signal<Turno>('mañana');
  protected readonly territorio = signal<number | null>(null);
  protected readonly nota = signal('');

  // Mapa
  protected readonly estadoRemoto = signal<EstadoTerritorioAdmin | null>(null);
  protected readonly cargandoTerritorio = signal(false);
  protected readonly base = signal<EstadoCorreccion>(vaciar());
  protected readonly edicion = signal<EstadoCorreccion>(vaciar());
  protected readonly modo = signal<Modo>('entera');
  protected readonly manzanaCalles = signal<ManzanaFeature | null>(null);

  // WhatsApp
  protected readonly enviarWhatsApp = signal(true);
  protected readonly destino = signal<string | null>(null);
  protected readonly editandoDestino = signal(false);
  protected readonly destinoTexto = signal('');

  protected readonly guardando = signal(false);
  protected readonly registrados = signal<Registrado[]>([]);

  protected readonly encargados = computed(() =>
    (this.store.encargados() ?? []).filter(e => e.activo).sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)),
  );
  protected readonly hermano = computed(() => resolverHermano(this.hermanoTexto(), this.encargados()));
  protected readonly manzanas = computed<ManzanaFeature[]>(() => {
    const t = this.territorio();
    return ((this.store.manzanas()?.features ?? []) as ManzanaFeature[])
      .filter(m => m.properties.territorio === t)
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre));
  });
  protected readonly color = computed(() => this.store.colores()[this.territorio() ?? -1] ?? '#2563eb');
  protected readonly zonasBloqueadas = computed(() => zonasDeLaBase(this.base(), this.edicion()));
  protected readonly nuevo = computed(() => aporte(this.base(), this.edicion()));
  protected readonly hayAlgo = computed(() => this.nuevo().enteras.length + this.nuevo().zonas.length > 0);
  protected readonly queda = computed(() => resultado(this.edicion(), this.manzanas().length));
  protected readonly vueltaNueva = computed(() => {
    const e = this.estadoRemoto()?.estado;
    return e === 'completed' || e === 'reiniciado';
  });

  /** Calles de la manzana elegida en modo «por calles», para el mapa y la lista. */
  protected readonly calles = computed<CalleVisible[] | null>(() => {
    const m = this.manzanaCalles();
    if (!m || this.modo() !== 'calles') return null;
    const lados = ladosDe(m);
    const { elegidas, deLaBase } = callesDe(this.base(), this.edicion(), m, lados.length);
    return lados.map(l => ({
      indice: l.indice,
      puntos: l.puntos,
      marcada: elegidas.includes(l.indice),
      bloqueada: deLaBase.includes(l.indice),
    }));
  });

  protected readonly puedeGuardar = computed(
    () => !!this.hermano().nombre && this.territorio() !== null && !!this.dia() && this.hayAlgo() && !this.guardando(),
  );

  constructor() {
    void this.store.cargarEncargados();
    void this.store.cargarManzanas();
    void this.cargarDestino();
  }

  private async cargarDestino(): Promise<void> {
    try {
      this.destino.set((await this.api.whatsappDestino()).telefono);
    } catch {
      this.destino.set(null);
    }
  }

  // ── Datos ──

  protected texto(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async elegirTerritorio(event: Event): Promise<void> {
    const valor = (event.target as HTMLSelectElement).value;
    const t = valor ? Number(valor) : null;
    this.territorio.set(t);
    this.manzanaCalles.set(null);
    this.estadoRemoto.set(null);
    this.base.set(vaciar());
    this.edicion.set(vaciar());
    if (t === null) return;
    this.cargandoTerritorio.set(true);
    try {
      await this.store.cargarManzanas();
      const estado = await this.api.estadoTerritorio(t);
      if (this.territorio() !== t) return;
      this.estadoRemoto.set(estado);
      const base = baseDeRegistro(estado, this.manzanas());
      this.base.set(base);
      this.edicion.set(base);
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo cargar el territorio'), 5000, 'error');
    } finally {
      this.cargandoTerritorio.set(false);
    }
  }

  // ── Mapa ──

  protected cambiarModo(modo: Modo): void {
    this.modo.set(modo);
    if (modo === 'entera') this.manzanaCalles.set(null);
  }

  protected alTocarManzana(m: ManzanaFeature): void {
    if (this.modo() === 'entera') {
      this.edicion.set(alternarEntera(this.base(), this.edicion(), m));
      return;
    }
    if (this.base().marcadas.has(clave(m))) {
      this.toast.show(`La manzana ${m.properties.nombre} ya estaba completa en este territorio`, 3000, 'info');
      return;
    }
    this.manzanaCalles.set(m);
  }

  protected alTocarZona(indice: number): void {
    if (this.modo() === 'calles') {
      const zona = this.edicion().zonas[indice];
      const m = zona?.manzanaId ? this.manzanas().find(x => clave(x) === zona.manzanaId) : undefined;
      if (m) this.manzanaCalles.set(m);
      return;
    }
    this.edicion.set(quitarZonaEnSalida(this.base(), this.edicion(), indice));
  }

  protected alTocarCalle(indice: number): void {
    const m = this.manzanaCalles();
    if (!m) return;
    this.edicion.set(alternarCalle(this.base(), this.edicion(), m, ladosDe(m), indice));
  }

  protected todo(): void {
    this.manzanaCalles.set(null);
    this.edicion.set(todoElTerritorio(this.manzanas()));
  }

  protected limpiar(): void {
    this.manzanaCalles.set(null);
    this.edicion.set(this.base());
  }

  // ── WhatsApp ──

  protected editarDestino(): void {
    this.destinoTexto.set(this.destino() ?? '');
    this.editandoDestino.set(true);
  }

  protected async guardarDestino(): Promise<void> {
    const telefono = this.destinoTexto().trim();
    if (telefono && !esCelularChileno(telefono)) {
      this.toast.show(MENSAJE_TELEFONO_INVALIDO, 5000, 'warning');
      return;
    }
    try {
      this.destino.set((await this.api.setWhatsappDestino(telefono)).telefono);
      this.editandoDestino.set(false);
      this.toast.show('Número guardado', 2500, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  // ── Guardar ──

  protected async registrar(): Promise<void> {
    const t = this.territorio();
    const hermano = this.hermano();
    if (t === null || !this.puedeGuardar()) return;
    const nombre = `${hermano.nombre} ${hermano.apellido}`.trim();
    const n = this.nuevo();
    const ok = await this.ui.confirmar({
      titulo: `Registrar la salida de ${nombre}`,
      mensaje:
        `Territorio ${t}, ${fmtFecha(this.dia() + 'T12:00:00')} en la ${this.turno()}: ` +
        `${n.enteras.length} manzana(s) entera(s)` +
        (n.zonas.length ? ` y ${n.zonas.length} por calles` : '') +
        (this.queda().completo ? '. El territorio queda completo.' : '.') +
        (hermano.id === null ? ` ${nombre} no tiene cuenta en la app: el registro queda con su nombre.` : ''),
      accion: 'Registrar',
    });
    if (!ok) return;

    this.guardando.set(true);
    const captura = this.mapa()?.capturar() ?? null;
    const dia = this.dia();
    const turno = this.turno();
    try {
      const salida = await this.api.registrarSalida(
        pedidoRegistro(t, hermano, dia, turno, this.base(), this.edicion(), this.manzanas().length, this.nota()),
      );
      let whatsapp: Registrado['whatsapp'] = 'no';
      if (this.enviarWhatsApp()) {
        whatsapp = (await this.enviarResumen(salida, hermano, dia, turno, captura)) ? 'enviado' : 'fallo';
      }
      this.registrados.update(l => [{ salida, hermano: nombre, dia, turno, whatsapp }, ...l]);
      this.toast.show(
        whatsapp === 'fallo' ? 'Salida registrada, pero el WhatsApp no se pudo enviar' : `Salida registrada: territorio ${t}`,
        4000,
        whatsapp === 'fallo' ? 'warning' : 'success',
      );
      // Para la próxima: se mantienen el hermano, el día y el turno (suelen ser varios del mismo día).
      this.territorio.set(null);
      this.estadoRemoto.set(null);
      this.base.set(vaciar());
      this.edicion.set(vaciar());
      this.manzanaCalles.set(null);
      this.nota.set('');
      void this.store.cargarReportes(true);
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo registrar la salida'), 6000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }

  private async enviarResumen(
    salida: SalidaRegistrada,
    hermano: Hermano,
    dia: string,
    turno: Turno,
    captura: string | null,
  ): Promise<boolean> {
    const completo = salida.estado === 'completed';
    try {
      const r = await this.whatsapp.sendReport({
        encargadoNombre: hermano.nombre,
        encargadoApellido: hermano.apellido,
        fechaRegistro: fechaParaWhatsApp(dia),
        predicacion: turno,
        territorios: [
          {
            numero: salida.territorioNumero,
            finalizado: completo,
            totalManzanas: salida.totalManzanas ?? this.manzanas().length,
            manzanasMarcadas: salida.manzanasMarcadas ?? 0,
          },
        ],
        // Un territorio completo va con la imagen oficial; si no, con el mapa.
        screenshotBase64: completo ? null : captura,
        destinationNumber: null,
      });
      return r.success;
    } catch {
      return false;
    }
  }

  protected readonly situacion = situacion;
  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fmtTelefono = fmtTelefono;
}
