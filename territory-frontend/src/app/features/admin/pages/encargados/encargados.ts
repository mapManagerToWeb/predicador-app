import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toast } from '../../../../core/services/toast';
import type { EncargadoAdmin } from '../../admin.models';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { aCsv, descargar } from '../../utils/csv';
import { fmtFecha, fmtFechaHora, fmtRelativo, fmtTelefono } from '../../utils/formato';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';
type FiltroAcceso = 'todos' | 'pin' | 'telefono' | 'bloqueado';

interface Formulario {
  id: number | null;
  nombre: string;
  apellido: string;
  telefono: string;
  activo: boolean;
}

/** Dígitos del teléfono sin el prefijo 56 (hay datos guardados con y sin él). */
export function claveTelefono(telefono: string | null): string {
  const d = (telefono ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('56') ? d.slice(2) : d;
}

export function claveNombre(e: Pick<EncargadoAdmin, 'nombre' | 'apellido'>): string {
  return `${e.nombre} ${e.apellido}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Encargados que comparten teléfono o nombre con otro: probables duplicados. */
export function posiblesDuplicados(lista: EncargadoAdmin[]): Map<number, string> {
  const motivos = new Map<number, string>();
  const agrupar = (clave: (e: EncargadoAdmin) => string, motivo: string) => {
    const grupos = new Map<string, EncargadoAdmin[]>();
    for (const e of lista) {
      const k = clave(e);
      if (!k) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), e]);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length > 1) for (const e of grupo) motivos.set(e.id, motivo);
    }
  };
  agrupar(e => claveNombre(e), 'Mismo nombre que otro encargado');
  agrupar(e => claveTelefono(e.telefono), 'Mismo teléfono que otro encargado');
  return motivos;
}

@Component({
  selector: 'app-encargados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './encargados.html',
  styleUrl: './encargados.css',
})
export class EncargadosPage {
  protected readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly registroAbierto = signal<boolean | null>(null);
  protected readonly busqueda = signal('');
  protected readonly filtroEstado = signal<FiltroEstado>('todos');
  protected readonly filtroAcceso = signal<FiltroAcceso>('todos');
  protected readonly seleccionadoId = signal<number | null>(null);
  protected readonly formulario = signal<Formulario | null>(null);
  protected readonly guardando = signal(false);
  protected readonly pinMostrado = signal<{ encargado: EncargadoAdmin; pin: string } | null>(null);
  protected readonly destinoFusion = signal<number | null>(null);

  protected readonly lista = computed(() => this.store.encargados() ?? []);
  protected readonly duplicados = computed(() => posiblesDuplicados(this.lista()));

  protected readonly filtrados = computed(() => {
    const q = claveNombre({ nombre: this.busqueda(), apellido: '' });
    const digitos = this.busqueda().replace(/\D/g, '');
    return this.lista().filter(e => {
      if (q && !claveNombre(e).includes(q) && !(digitos && (e.telefono ?? '').includes(digitos))) return false;
      if (this.filtroEstado() === 'activos' && !e.activo) return false;
      if (this.filtroEstado() === 'inactivos' && e.activo) return false;
      const acceso = this.acceso(e);
      if (this.filtroAcceso() !== 'todos' && acceso !== this.filtroAcceso()) return false;
      return true;
    });
  });

  protected readonly seleccionado = computed(() => this.lista().find(e => e.id === this.seleccionadoId()) ?? null);

  protected readonly totales = computed(() => {
    const l = this.lista();
    return {
      activos: l.filter(e => e.activo).length,
      conPin: l.filter(e => e.tienePin).length,
      sinPin: l.filter(e => e.activo && !e.tienePin).length,
      bloqueados: l.filter(e => e.bloqueadoHasta).length,
    };
  });

  constructor() {
    void this.cargar();
  }

  async cargar(forzar = false): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const [, config] = await Promise.all([this.store.cargarEncargados(forzar), this.api.configuracion()]);
      this.registroAbierto.set(config.registroAbierto);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar los encargados'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected acceso(e: EncargadoAdmin): Exclude<FiltroAcceso, 'todos'> {
    if (e.bloqueadoHasta) return 'bloqueado';
    return e.tienePin ? 'pin' : 'telefono';
  }

  // ── Registro abierto ──

  protected async alternarRegistro(): Promise<void> {
    const abrir = !this.registroAbierto();
    const ok = await this.ui.confirmar({
      titulo: abrir ? 'Abrir el registro' : 'Cerrar el registro',
      mensaje: abrir
        ? 'Cualquier persona que abra la app podrá crear su propio perfil de encargado.'
        : 'Solo vos vas a poder dar de alta encargados desde este panel. Los que ya existen siguen entrando con su teléfono (y PIN, si tienen).',
      accion: abrir ? 'Abrir registro' : 'Cerrar registro',
    });
    if (!ok) return;
    try {
      this.registroAbierto.set((await this.api.setRegistroAbierto(abrir)).registroAbierto);
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  // ── Alta y edición ──

  protected nuevo(): void {
    this.seleccionadoId.set(null);
    this.formulario.set({ id: null, nombre: '', apellido: '', telefono: '', activo: true });
  }

  protected editar(e: EncargadoAdmin): void {
    this.formulario.set({ id: e.id, nombre: e.nombre, apellido: e.apellido, telefono: e.telefono ?? '', activo: e.activo });
  }

  protected campo(nombre: keyof Formulario, event: Event): void {
    const input = event.target as HTMLInputElement;
    const valor = input.type === 'checkbox' ? input.checked : input.value;
    this.formulario.update(f => (f ? { ...f, [nombre]: valor } : f));
  }

  protected async guardar(): Promise<void> {
    const f = this.formulario();
    if (!f) return;
    const req = { nombre: f.nombre.trim(), apellido: f.apellido.trim(), telefono: f.telefono.trim(), activo: f.activo };
    if (!req.nombre || !req.apellido || !req.telefono) {
      this.toast.show('Nombre, apellido y teléfono son obligatorios.', 4000, 'warning');
      return;
    }
    this.guardando.set(true);
    try {
      const guardado = f.id === null ? await this.api.crearEncargado(req) : await this.api.actualizarEncargado(f.id, req);
      this.reemplazar(guardado);
      this.formulario.set(null);
      this.seleccionadoId.set(guardado.id);
      this.toast.show(f.id === null ? 'Encargado creado' : 'Cambios guardados', 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }

  // ── Credenciales ──

  protected async generarPin(e: EncargadoAdmin): Promise<void> {
    const ok = await this.ui.confirmar({
      titulo: e.tienePin ? `Nuevo PIN para ${e.nombre}` : `Crear PIN para ${e.nombre}`,
      mensaje: e.tienePin
        ? 'El PIN actual deja de funcionar. Vas a tener que pasarle el nuevo.'
        : `Desde ahora ${e.nombre} va a tener que ingresar su teléfono y este PIN. Solo se muestra una vez.`,
      accion: 'Generar PIN',
    });
    if (!ok) return;
    try {
      const { pin } = await this.api.generarPin(e.id);
      this.pinMostrado.set({ encargado: e, pin });
      await this.store.cargarEncargados(true);
    } catch (err) {
      this.toast.show(mensajeDeError(err), 5000, 'error');
    }
  }

  protected async quitarPin(e: EncargadoAdmin): Promise<void> {
    const ok = await this.ui.confirmar({
      titulo: `Quitar el PIN de ${e.nombre}`,
      mensaje: 'Va a poder entrar solo con su número de teléfono.',
      accion: 'Quitar PIN',
      peligro: true,
    });
    if (!ok) return;
    await this.accion(() => this.api.quitarPin(e.id), 'PIN quitado');
  }

  protected desbloquear(e: EncargadoAdmin): Promise<void> {
    return this.accion(() => this.api.desbloquearEncargado(e.id), `${e.nombre} desbloqueado`);
  }

  protected async alternarActivo(e: EncargadoAdmin): Promise<void> {
    if (e.activo) {
      const ok = await this.ui.confirmar({
        titulo: `Desactivar a ${e.nombre} ${e.apellido}`,
        mensaje: 'No va a poder entrar a la app. Sus reportes se conservan y podés reactivarlo cuando quieras.',
        accion: 'Desactivar',
        peligro: true,
      });
      if (!ok) return;
    }
    await this.accion(
      () =>
        this.api.actualizarEncargado(e.id, {
          nombre: e.nombre,
          apellido: e.apellido,
          telefono: e.telefono ?? '',
          activo: !e.activo,
        }),
      e.activo ? 'Encargado desactivado' : 'Encargado activado',
    );
  }

  protected async fusionar(origen: EncargadoAdmin): Promise<void> {
    const destino = this.lista().find(e => e.id === this.destinoFusion());
    if (!destino) return;
    const ok = await this.ui.confirmar({
      titulo: 'Fusionar encargados',
      mensaje: `Los ${origen.totalReportes} reportes de "${origen.nombre} ${origen.apellido}" pasan a "${destino.nombre} ${destino.apellido}" y el primero se elimina. No se puede deshacer.`,
      accion: 'Fusionar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await this.api.fusionarEncargados(origen.id, destino.id);
      await Promise.all([this.store.cargarEncargados(true), this.store.cargarReportes(true)]);
      this.destinoFusion.set(null);
      this.seleccionadoId.set(destino.id);
      this.toast.show('Encargados fusionados', 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    }
  }

  protected async eliminar(e: EncargadoAdmin): Promise<void> {
    const ok = await this.ui.confirmar({
      titulo: `Eliminar a ${e.nombre} ${e.apellido}`,
      mensaje: 'Solo se puede eliminar un encargado sin reportes. Si tiene, desactivalo o fusionalo.',
      accion: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await this.api.eliminarEncargado(e.id);
      this.store.encargados.update(l => l?.filter(x => x.id !== e.id) ?? l);
      this.seleccionadoId.set(null);
      this.toast.show('Encargado eliminado', 3000, 'success');
    } catch (err) {
      this.toast.show(mensajeDeError(err), 6000, 'error');
    }
  }

  protected copiarPin(): void {
    const pin = this.pinMostrado()?.pin;
    if (pin) void navigator.clipboard?.writeText(pin).then(() => this.toast.show('PIN copiado', 2000, 'success'));
  }

  /** Enlace para mandar el PIN por WhatsApp desde el teléfono o la web del administrador. */
  protected enlaceWhatsApp(e: EncargadoAdmin, pin: string): string | null {
    const d = claveTelefono(e.telefono);
    if (d.length < 8) return null;
    const texto =
      `Hola ${e.nombre}, tu PIN para entrar a la app de territorios es ${pin}. ` +
      'Ingresá con tu número de teléfono y después escribí este PIN.';
    return `https://wa.me/56${d}?text=${encodeURIComponent(texto)}`;
  }

  protected exportar(): void {
    const csv = aCsv(
      ['Nombre', 'Apellido', 'Teléfono', 'Activo', 'Acceso', 'Último acceso', 'Reportes', 'Último reporte', 'Alta'],
      this.lista().map(e => [
        e.nombre,
        e.apellido,
        e.telefono,
        e.activo ? 'Sí' : 'No',
        e.tienePin ? 'Teléfono + PIN' : 'Solo teléfono',
        fmtFechaHora(e.ultimoAcceso, ''),
        e.totalReportes,
        fmtFecha(e.ultimoReporte, ''),
        fmtFecha(e.creadoEn, ''),
      ]),
    );
    descargar(`encargados-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  protected idElegido(event: Event): number | null {
    const id = Number((event.target as HTMLSelectElement).value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  protected texto(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private async accion(llamada: () => Promise<EncargadoAdmin>, ok: string): Promise<void> {
    try {
      this.reemplazar(await llamada());
      this.toast.show(ok, 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    }
  }

  private reemplazar(e: EncargadoAdmin): void {
    this.store.encargados.update(l => {
      const lista = l ?? [];
      return lista.some(x => x.id === e.id) ? lista.map(x => (x.id === e.id ? e : x)) : [...lista, e];
    });
  }

  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fmtRelativo = fmtRelativo;
  protected readonly fmtTelefono = fmtTelefono;
}
