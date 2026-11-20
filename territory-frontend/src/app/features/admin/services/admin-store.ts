import { computed, inject, Injectable, signal } from '@angular/core';
import type { EncargadoAdmin, EstadoCapacitacion, ManzanasCollection, ReporteAdmin } from '../admin.models';
import { AdminApi } from './admin-api';
import { esSalida } from '../utils/analytics';
import { situacionDe, type SituacionTerritorio } from '../../../core/map/estado-publico';
import { avanceDe } from '../utils/avance';

/** Historial que carga el panel: suficiente para la cobertura y el registro por territorio. */
const ANIOS_DE_HISTORIAL = 10;

/**
 * Datos compartidos entre las páginas del panel. Se cargan una vez y se
 * refrescan después de cada cambio, así el resumen, el editor y los listados
 * muestran siempre lo mismo.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly api = inject(AdminApi);

  readonly manzanas = signal<ManzanasCollection | null>(null);
  readonly colores = signal<Record<number, string>>({});
  /**
   * Todos los reportes, también los anulados por el administrador (ADR 0014):
   * solo para el historial de la página de Reportes.
   */
  readonly todosLosReportes = signal<ReporteAdmin[] | null>(null);
  /** Los que cuentan (sin anulados): estado, cobertura, S-13 e informes. */
  readonly reportes = computed(() => this.todosLosReportes()?.filter(r => !r.anuladoEn) ?? null);
  readonly encargados = signal<EncargadoAdmin[] | null>(null);

  // ── La vuelta actual (la campaña): cómo va cada territorio y cuáles no cuentan ──
  /** Situación de cada territorio en la vuelta (la misma regla que los números del mapa); null sin cargar. */
  readonly situaciones = signal<ReadonlyMap<number, SituacionTerritorio> | null>(null);
  /** Día en que empezó la vuelta abierta (ISO), si se sabe. */
  readonly inicioVuelta = signal<string | null>(null);
  /** Territorios que el administrador dejó fuera de la meta. */
  readonly fueraDeMeta = signal<number[]>([]);
  /** Capacitación: null hasta saber (o con un servidor que no tiene esta opción). */
  readonly capacitacion = signal<EstadoCapacitacion | null>(null);

  /** Cantidad de manzanas por territorio. */
  readonly manzanasPorTerritorio = computed(() => {
    const conteo = new Map<number, number>();
    for (const f of this.manzanas()?.features ?? []) {
      conteo.set(f.properties.territorio, (conteo.get(f.properties.territorio) ?? 0) + 1);
    }
    return conteo;
  });

  /** Solo el trabajo de los encargados (sin correcciones ni reinicios del administrador). */
  readonly salidas = computed(() => (this.reportes() ?? []).filter(esSalida));

  readonly territorios = computed(() => [...this.manzanasPorTerritorio().keys()].sort((a, b) => a - b));

  /** Los territorios que cuentan para la meta: todos menos los que se dejaron fuera. */
  readonly territoriosEnMeta = computed(() => {
    const fuera = new Set(this.fueraDeMeta());
    return this.territorios().filter(t => !fuera.has(t));
  });
  /** Avance de la vuelta sobre los territorios que cuentan. */
  readonly avanceVuelta = computed(() => avanceDe(this.territoriosEnMeta(), this.situaciones() ?? new Map()));

  private cargas = new Map<string, Promise<unknown>>();

  /** Estado de la vuelta, su inicio y los territorios fuera de la meta. */
  cargarVuelta(forzar = false): Promise<void> {
    return this.unaVez('vuelta', forzar, async () => {
      const [estados, ciclos, fuera] = await Promise.all([
        this.api.estadoPublico(),
        this.api.ciclos().catch(() => []),
        // Un servidor que todavía no tiene esta opción: nadie queda fuera.
        this.api.fueraDeMeta().catch(() => []),
      ]);
      this.situaciones.set(new Map(estados.map(e => [e.territorio, situacionDe(e)])));
      this.inicioVuelta.set(ciclos.find(c => !c.fin)?.inicio ?? null);
      this.fueraDeMeta.set(fuera);
    });
  }

  async guardarFueraDeMeta(territorios: number[]): Promise<void> {
    this.fueraDeMeta.set(await this.api.setFueraDeMeta(territorios));
  }

  /** Si hay una capacitación y qué se envió en ella. Un servidor sin esta opción la deja en null. */
  async cargarCapacitacion(): Promise<void> {
    try {
      this.capacitacion.set(await this.api.capacitacion());
    } catch {
      // Sin la opción en el servidor o sin conexión: no se muestra nada nuevo.
    }
  }

  async empezarCapacitacion(): Promise<void> {
    this.capacitacion.set(await this.api.empezarCapacitacion());
  }

  /** Termina la capacitación, borra lo de prueba y vuelve a cargar lo que cambió. */
  async terminarCapacitacion(): Promise<number> {
    const borrados = await this.api.terminarCapacitacion();
    this.capacitacion.set({ activa: false, desde: null, pruebas: [] });
    await Promise.all([this.cargarReportes(true), this.cargarVuelta(true)]).catch(() => undefined);
    return borrados;
  }

  cargarManzanas(forzar = false): Promise<void> {
    return this.unaVez('manzanas', forzar, async () => {
      const [manzanas, colores] = await Promise.all([this.api.manzanas(), this.api.colores()]);
      this.manzanas.set(manzanas);
      this.colores.set(colores);
    });
  }

  cargarReportes(forzar = false): Promise<void> {
    return this.unaVez('reportes', forzar, async () => {
      const hasta = new Date(Date.now() + 60_000);
      const desde = new Date(hasta.getFullYear() - ANIOS_DE_HISTORIAL, hasta.getMonth(), hasta.getDate());
      this.todosLosReportes.set(await this.api.reportesEntre(desde, hasta));
    });
  }

  cargarEncargados(forzar = false): Promise<void> {
    return this.unaVez('encargados', forzar, async () => {
      this.encargados.set(await this.api.listarEncargados());
    });
  }

  async recargarColores(): Promise<void> {
    this.colores.set(await this.api.colores());
  }

  /** Olvida todo (al cerrar sesión). */
  limpiar(): void {
    this.cargas.clear();
    this.manzanas.set(null);
    this.colores.set({});
    this.todosLosReportes.set(null);
    this.encargados.set(null);
    this.situaciones.set(null);
    this.inicioVuelta.set(null);
    this.fueraDeMeta.set([]);
    this.capacitacion.set(null);
  }

  /** Evita pedir lo mismo dos veces cuando varias páginas lo necesitan a la vez. */
  private unaVez(clave: string, forzar: boolean, carga: () => Promise<void>): Promise<void> {
    const existente = this.cargas.get(clave);
    if (existente && !forzar) return existente as Promise<void>;
    const promesa = carga().catch(error => {
      this.cargas.delete(clave);
      throw error;
    });
    this.cargas.set(clave, promesa);
    return promesa;
  }
}
