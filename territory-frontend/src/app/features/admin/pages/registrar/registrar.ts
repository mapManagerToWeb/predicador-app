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
  delTerritorio,
  hermanoEscrito,
  ladosDe,
  pedidoRegistro,
  resultado,
  sinTerritorio,
  todoElTerritorioEn,
  unir,
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
  salidas: SalidaRegistrada[];
  hermano: string;
  dia: string;
  turno: Turno;
  whatsapp: 'enviado' | 'fallo' | 'no';
}

/** Cómo va un territorio de la salida: lo nuevo y cómo queda. */
export interface ResumenTerritorio {
  numero: number;
  color: string;
  total: number;
  enteras: number;
  porCalles: number;
  queda: { enteras: number; porCalles: number; completo: boolean };
  estado: EstadoTerritorioAdmin | null;
}

/**
 * Registrar una salida que un hermano informó (p. ej. por WhatsApp), mientras
 * los hermanos aprenden a usar la app. Puede tener varios territorios, como en
 * la app. Queda como salida de él: suma a cada territorio, sale en el S-13 y en
 * Reportes. El resumen (uno por salida) le llega por WhatsApp al administrador.
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
  /** Territorios de la salida, en el orden en que se agregaron. */
  protected readonly territorios = signal<number[]>([]);
  /** El territorio en el que se está trabajando (para «Todo el territorio»). */
  protected readonly activo = signal<number | null>(null);
  protected readonly nota = signal('');

  // Mapa: el estado de todos los territorios de la salida va junto (las claves dicen el territorio).
  protected readonly estados = signal<Map<number, EstadoTerritorioAdmin | null>>(new Map());
  protected readonly cargandoTerritorio = signal<number | null>(null);
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
  /** Territorios que todavía se pueden agregar. */
  protected readonly disponibles = computed(() => this.store.territorios().filter(t => !this.territorios().includes(t)));
  /** Manzanas de todos los territorios de la salida. */
  protected readonly manzanas = computed<ManzanaFeature[]>(() => {
    const ts = new Set(this.territorios());
    return ((this.store.manzanas()?.features ?? []) as ManzanaFeature[])
      .filter(m => ts.has(m.properties.territorio))
      .sort((a, b) => a.properties.territorio - b.properties.territorio || a.properties.nombre.localeCompare(b.properties.nombre));
  });
  protected readonly colores = computed(() => {
    const c: Record<number, string> = {};
    for (const t of this.territorios()) c[t] = this.store.colores()[t] ?? '#2563eb';
    return c;
  });
  protected readonly zonasBloqueadas = computed(() => zonasDeLaBase(this.base(), this.edicion()));

  protected readonly resumenes = computed<ResumenTerritorio[]>(() =>
    this.territorios().map(t => {
      const manzanas = this.manzanas().filter(m => m.properties.territorio === t);
      const nuevo = aporte(delTerritorio(this.base(), t), delTerritorio(this.edicion(), t));
      return {
        numero: t,
        color: this.colores()[t],
        total: manzanas.length,
        enteras: nuevo.enteras.length,
        porCalles: nuevo.zonas.length,
        queda: resultado(delTerritorio(this.edicion(), t), manzanas.length),
        estado: this.estados().get(t) ?? null,
      };
    }),
  );
  /** Territorios agregados en los que todavía no se marcó nada. */
  protected readonly sinMarcar = computed(() => this.resumenes().filter(r => r.enteras + r.porCalles === 0).map(r => r.numero));

  /** Calles de la manzana elegida en modo «por calles», para el mapa. */
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
    () =>
      !!this.hermano().nombre &&
      this.territorios().length > 0 &&
      this.sinMarcar().length === 0 &&
      this.cargandoTerritorio() === null &&
      !!this.dia() &&
      !this.guardando(),
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

  /** Agrega un territorio a la salida (desde el selector). */
  protected async alElegirTerritorio(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const t = select.value ? Number(select.value) : null;
    select.value = '';
    if (t !== null) await this.agregarTerritorio(t);
  }

  async agregarTerritorio(t: number): Promise<void> {
    if (this.territorios().includes(t)) {
      this.activo.set(t);
      return;
    }
    this.territorios.update(l => [...l, t]);
    this.activo.set(t);
    this.cargandoTerritorio.set(t);
    try {
      await this.store.cargarManzanas();
      const estado = await this.api.estadoTerritorio(t);
      if (!this.territorios().includes(t)) return;
      this.estados.update(m => new Map(m).set(t, estado));
      const base = baseDeRegistro(estado, this.manzanas().filter(m => m.properties.territorio === t));
      this.base.update(b => unir(sinTerritorio(b, t), base));
      this.edicion.update(e => unir(sinTerritorio(e, t), base));
    } catch (e) {
      this.quitarTerritorio(t);
      this.toast.show(mensajeDeError(e, `No se pudo cargar el territorio ${t}`), 5000, 'error');
    } finally {
      if (this.cargandoTerritorio() === t) this.cargandoTerritorio.set(null);
    }
  }

  protected quitarTerritorio(t: number): void {
    this.territorios.update(l => l.filter(x => x !== t));
    this.estados.update(m => {
      const n = new Map(m);
      n.delete(t);
      return n;
    });
    this.base.update(b => sinTerritorio(b, t));
    this.edicion.update(e => sinTerritorio(e, t));
    if (this.manzanaCalles()?.properties.territorio === t) this.manzanaCalles.set(null);
    if (this.activo() === t) this.activo.set(this.territorios().at(-1) ?? null);
  }

  // ── Mapa ──

  protected cambiarModo(modo: Modo): void {
    this.modo.set(modo);
    if (modo === 'entera') this.manzanaCalles.set(null);
  }

  protected alTocarManzana(m: ManzanaFeature): void {
    this.activo.set(m.properties.territorio);
    if (this.modo() === 'entera') {
      this.edicion.set(alternarEntera(this.base(), this.edicion(), m));
      return;
    }
    if (this.base().marcadas.has(clave(m))) {
      this.toast.show(`La manzana ${m.properties.nombre} ya estaba completa`, 3000, 'info');
      return;
    }
    this.manzanaCalles.set(m);
  }

  protected alTocarZona(indice: number): void {
    const zona = this.edicion().zonas[indice];
    if (this.modo() === 'calles') {
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

  /** «Territorio X completado»: todas sus manzanas (solo el territorio activo). */
  protected todo(t: number): void {
    this.activo.set(t);
    this.manzanaCalles.set(null);
    this.edicion.set(todoElTerritorioEn(this.edicion(), this.manzanas(), t));
  }

  protected deshacer(t: number): void {
    this.manzanaCalles.set(null);
    this.edicion.set(unir(sinTerritorio(this.edicion(), t), delTerritorio(this.base(), t)));
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
    const hermano = this.hermano();
    const territorios = this.territorios();
    if (!this.puedeGuardar()) return;
    const nombre = `${hermano.nombre} ${hermano.apellido}`.trim();
    const detalle = this.resumenes()
      .map(
        r =>
          `territorio ${r.numero}: ${r.enteras} manzana(s)` +
          (r.porCalles ? ` y ${r.porCalles} por calles` : '') +
          (r.queda.completo ? ' (queda completo)' : ''),
      )
      .join('; ');
    const ok = await this.ui.confirmar({
      titulo: `Registrar la salida de ${nombre}`,
      mensaje:
        `${fmtFecha(this.dia() + 'T12:00:00')} en la ${this.turno()}. ${detalle[0]?.toUpperCase() ?? ''}${detalle.slice(1)}.` +
        (hermano.id === null ? ` ${nombre} no tiene cuenta en la app: el registro queda con su nombre.` : ''),
      accion: 'Registrar',
    });
    if (!ok) return;

    this.guardando.set(true);
    // La imagen del mapa con todos los territorios de la salida.
    this.manzanaCalles.set(null);
    const captura = this.mapa()?.capturar() ?? null;
    const dia = this.dia();
    const turno = this.turno();
    try {
      const pedidos = territorios.map(t =>
        pedidoRegistro(
          t,
          hermano,
          dia,
          turno,
          delTerritorio(this.base(), t),
          delTerritorio(this.edicion(), t),
          this.manzanas().filter(m => m.properties.territorio === t).length,
          this.nota(),
        ),
      );
      const salidas = await this.api.registrarSalidas(pedidos);
      let whatsapp: Registrado['whatsapp'] = 'no';
      if (this.enviarWhatsApp()) {
        whatsapp = (await this.enviarResumen(salidas, hermano, dia, turno, captura)) ? 'enviado' : 'fallo';
      }
      this.registrados.update(l => [{ salidas, hermano: nombre, dia, turno, whatsapp }, ...l]);
      const cuales = salidas.map(x => x.territorioNumero).join(', ');
      this.toast.show(
        whatsapp === 'fallo'
          ? 'Salida registrada, pero el WhatsApp no se pudo enviar'
          : `Salida registrada: ${salidas.length === 1 ? 'territorio' : 'territorios'} ${cuales}`,
        4000,
        whatsapp === 'fallo' ? 'warning' : 'success',
      );
      // Para la próxima: se mantienen el hermano, el día y el turno (suelen ser varios del mismo día).
      this.territorios.set([]);
      this.activo.set(null);
      this.estados.set(new Map());
      this.base.set(vaciar());
      this.edicion.set(vaciar());
      this.nota.set('');
      void this.store.cargarReportes(true);
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo registrar la salida'), 6000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }

  /** Un WhatsApp con todos los territorios, como el que manda la app. */
  private async enviarResumen(
    salidas: SalidaRegistrada[],
    hermano: Hermano,
    dia: string,
    turno: Turno,
    captura: string | null,
  ): Promise<boolean> {
    const territorios = salidas.map(x => ({
      numero: x.territorioNumero,
      finalizado: x.estado === 'completed',
      totalManzanas: x.totalManzanas ?? this.manzanas().filter(m => m.properties.territorio === x.territorioNumero).length,
      manzanasMarcadas: x.manzanasMarcadas ?? 0,
    }));
    // Igual que la app: un solo territorio completo va con la imagen oficial; si no, con el mapa.
    const imagenOficial = territorios.length === 1 && territorios[0].finalizado;
    try {
      const r = await this.whatsapp.sendReport({
        encargadoNombre: hermano.nombre,
        encargadoApellido: hermano.apellido,
        fechaRegistro: fechaParaWhatsApp(dia),
        predicacion: turno,
        territorios,
        screenshotBase64: imagenOficial ? null : captura,
        destinationNumber: null,
      });
      return r.success;
    } catch {
      return false;
    }
  }

  protected territoriosDe(r: Registrado): string {
    return r.salidas.map(x => x.territorioNumero).join(', ');
  }

  protected readonly situacion = situacion;
  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fmtTelefono = fmtTelefono;
}
