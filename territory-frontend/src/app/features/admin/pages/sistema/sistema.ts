import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import type { ContenedorSistema, EstadoSistema, RespaldoSistema } from '../../admin.models';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { fmtFechaHora, fmtRelativo } from '../../utils/formato';

type Tono = 'good' | 'warning' | 'serious' | 'critical' | 'info' | '';

/** Cada cuánto se actualiza la página mientras está abierta. */
const REFRESCO_MS = 15_000;
/** Un respaldo bueno más viejo que esto merece aviso (el workflow corre a diario). */
const RESPALDO_VIEJO_MS = 36 * 3600_000;

/** "1,5 GB", "820 MB". */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const decimales = valor < 10 && i >= 3 ? 1 : 0;
  return `${valor.toLocaleString('es-CL', { maximumFractionDigits: decimales, minimumFractionDigits: decimales })} ${unidades[i]}`;
}

/** "3 días y 4 horas", "5 horas", "12 minutos". */
export function fmtDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return '—';
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const plural = (n: number, palabra: string) => `${n} ${palabra}${n === 1 ? '' : 's'}`;
  if (dias > 0) return horas > 0 ? `${plural(dias, 'día')} y ${plural(horas, 'hora')}` : plural(dias, 'día');
  if (horas > 0) return plural(horas, 'hora');
  return plural(minutos, 'minuto');
}

/** Color de una barra de uso: amarillo desde el 85 %, rojo desde el 95 %. */
export function tonoUso(porcentaje: number | null): Tono {
  if (porcentaje === null) return '';
  if (porcentaje >= 95) return 'critical';
  if (porcentaje >= 85) return 'warning';
  return 'good';
}

/** Estado de un contenedor en palabras simples (Docker lo da en inglés). */
export function estadoContenedor(c: Pick<ContenedorSistema, 'estado' | 'detalle'>): { texto: string; tono: Tono } {
  const detalle = c.detalle ?? '';
  switch (c.estado) {
    case 'running':
      if (detalle.includes('(unhealthy)')) return { texto: 'Con problemas', tono: 'critical' };
      if (detalle.includes('(health: starting)')) return { texto: 'Arrancando', tono: 'warning' };
      return { texto: 'Funcionando', tono: 'good' };
    case 'restarting':
      return { texto: 'Reiniciándose', tono: 'serious' };
    case 'exited':
      // db-import termina solo y con código 0: es lo normal.
      return /Exited \(0\)/.test(detalle)
        ? { texto: 'Terminó bien', tono: '' }
        : { texto: 'Se detuvo con error', tono: 'critical' };
    case 'paused':
      return { texto: 'En pausa', tono: 'warning' };
    case 'created':
      return { texto: 'Sin iniciar', tono: '' };
    default:
      return { texto: 'Detenido', tono: 'serious' };
  }
}

export function resultadoRespaldo(r: Pick<RespaldoSistema, 'resultado'>): { texto: string; tono: Tono } {
  if (r.resultado === 'ok') return { texto: 'Bien', tono: 'good' };
  if (r.resultado === 'fallo') return { texto: 'Falló', tono: 'critical' };
  return { texto: 'En curso', tono: 'info' };
}

/**
 * Módulo «Sistema»: estado del VPS (memoria, disco, CPU), contenedores y
 * respaldos. Solo para mirar: para reiniciar o apagar está Portainer. Pide de
 * nuevo la contraseña del administrador y se cierra solo tras un rato sin uso.
 */
@Component({
  selector: 'app-sistema',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sistema.html',
  styleUrl: './sistema.css',
})
export class SistemaPage {
  private readonly api = inject(AdminApi);

  /** null mientras se averigua si hay un pase vigente. */
  protected readonly bloqueado = signal<boolean | null>(null);
  protected readonly clave = signal('');
  protected readonly entrando = signal(false);
  protected readonly errorClave = signal<string | null>(null);
  protected readonly estado = signal<EstadoSistema | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly cargando = signal(false);

  protected readonly memoria = computed(() => porcentaje(this.estado()?.servidor.memoriaUsada, this.estado()?.servidor.memoriaTotal));
  protected readonly disco = computed(() => porcentaje(this.estado()?.servidor.discoUsado, this.estado()?.servidor.discoTotal));
  /** Los servicios de la app: los del mismo proyecto de Docker Compose que el gateway. */
  protected readonly servicios = computed(() => separarContenedores(this.estado()?.contenedores ?? []).app);
  /** Otros contenedores del servidor (Portainer, otros proyectos): se muestran, pero no dan aviso. */
  protected readonly otros = computed(() => separarContenedores(this.estado()?.contenedores ?? []).otros);
  protected readonly problemas = computed(() =>
    this.servicios().filter(c => ['critical', 'serious'].includes(estadoContenedor(c).tono)),
  );
  protected readonly nombresConProblemas = computed(() => this.problemas().map(c => c.nombre).join(', '));
  protected readonly ultimoRespaldoBueno = computed(() => this.estado()?.respaldos?.find(r => r.resultado === 'ok') ?? null);
  protected readonly respaldoViejo = computed(() => {
    const r = this.ultimoRespaldoBueno();
    const respaldos = this.estado()?.respaldos;
    if (!respaldos) return false;
    return !r || Date.now() - new Date(r.fecha).getTime() > RESPALDO_VIEJO_MS;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      void this.cargar();
      const intervalo = setInterval(() => {
        if (this.bloqueado() === false && document.visibilityState === 'visible') void this.cargar();
      }, REFRESCO_MS);
      destroyRef.onDestroy(() => clearInterval(intervalo));
    });
  }

  async cargar(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true);
    try {
      this.estado.set(await this.api.estadoSistema());
      this.bloqueado.set(false);
      this.error.set(null);
    } catch (e) {
      if (codigo(e) === 'sistema_bloqueado') {
        if (this.bloqueado() === false) this.errorClave.set('Se cerró por seguridad tras un rato sin uso. Vuelve a escribir la contraseña.');
        this.bloqueado.set(true);
        this.estado.set(null);
      } else if (this.bloqueado() === null) {
        this.bloqueado.set(true);
        this.errorClave.set(mensajeDeError(e, 'No se pudo abrir el módulo'));
      } else {
        this.error.set(mensajeDeError(e, 'No se pudo actualizar'));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  async entrar(): Promise<void> {
    const clave = this.clave();
    if (!clave || this.entrando()) return;
    this.entrando.set(true);
    this.errorClave.set(null);
    try {
      await this.api.entrarSistema(clave);
      this.clave.set('');
      await this.cargar();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      this.errorClave.set(
        codigo(e) === 'clave_incorrecta'
          ? 'La contraseña no es correcta.'
          : status === 429
            ? 'Demasiados intentos. Espera un minuto.'
            : mensajeDeError(e, 'No se pudo entrar'),
      );
    } finally {
      this.entrando.set(false);
    }
  }

  async salir(): Promise<void> {
    try {
      await this.api.salirSistema();
    } finally {
      this.estado.set(null);
      this.errorClave.set(null);
      this.bloqueado.set(true);
    }
  }

  protected escribirClave(event: Event): void {
    this.clave.set((event.target as HTMLInputElement).value);
  }

  protected readonly fmtBytes = fmtBytes;
  protected readonly fmtDuracion = fmtDuracion;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fmtRelativo = fmtRelativo;
  protected readonly tonoUso = tonoUso;
  protected readonly estadoContenedor = estadoContenedor;
  protected readonly resultadoRespaldo = resultadoRespaldo;
}

/** Separa los servicios de la app (mismo proyecto que api-gateway) del resto. Sin esa pista, todos son de la app. */
export function separarContenedores(lista: ContenedorSistema[]): { app: ContenedorSistema[]; otros: ContenedorSistema[] } {
  const proyecto = lista.find(c => c.nombre === 'api-gateway')?.proyecto;
  if (!proyecto) return { app: lista, otros: [] };
  return { app: lista.filter(c => c.proyecto === proyecto), otros: lista.filter(c => c.proyecto !== proyecto) };
}

function porcentaje(usado: number | undefined, total: number | undefined): number | null {
  return usado === undefined || !total ? null : Math.round((100 * usado) / total);
}

function codigo(error: unknown): string | null {
  const c = (error as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof c === 'string' ? c : null;
}
