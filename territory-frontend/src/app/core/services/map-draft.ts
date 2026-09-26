import { Injectable } from '@angular/core';

const STORAGE_KEY = 'territory_map_draft';

/**
 * Almacén del borrador del mapa (lo marcado y todavía no enviado), para que
 * sobreviva a una recarga o a que el navegador cierre la app. Solo guarda y
 * lee JSON: el formato y su validación son del mapa
 * (`features/map/utils/borrador.ts`); acá vive para que el logout lo borre.
 */
@Injectable({ providedIn: 'root' })
export class DraftMarksService {
  private get storage(): Storage | undefined {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  }

  guardar(valor: unknown): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(valor));
    } catch {
      this.clear();
    }
  }

  /** El JSON guardado, o null si no hay o está roto. */
  cargar(): unknown {
    try {
      const data = this.storage?.getItem(STORAGE_KEY);
      return data ? (JSON.parse(data) as unknown) : null;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode).
    }
  }
}
