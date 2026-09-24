import { computed, inject, Injectable, signal } from '@angular/core';
import type { EncargadoAdmin, ManzanasCollection, ReporteAdmin } from '../admin.models';
import { AdminApi } from './admin-api';

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
  readonly reportes = signal<ReporteAdmin[] | null>(null);
  readonly encargados = signal<EncargadoAdmin[] | null>(null);

  /** Cantidad de manzanas por territorio. */
  readonly manzanasPorTerritorio = computed(() => {
    const conteo = new Map<number, number>();
    for (const f of this.manzanas()?.features ?? []) {
      conteo.set(f.properties.territorio, (conteo.get(f.properties.territorio) ?? 0) + 1);
    }
    return conteo;
  });

  readonly territorios = computed(() => [...this.manzanasPorTerritorio().keys()].sort((a, b) => a - b));

  private cargas = new Map<string, Promise<unknown>>();

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
      this.reportes.set(await this.api.reportesEntre(desde, hasta));
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
    this.reportes.set(null);
    this.encargados.set(null);
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
