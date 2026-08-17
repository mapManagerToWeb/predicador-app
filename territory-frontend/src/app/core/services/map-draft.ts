import { Injectable } from '@angular/core';
import type { ManzanaMarcada, ModoMarcado } from '../../features/map/types/map.types';

const STORAGE_KEY = 'territory_map_draft';

export interface DraftPoint {
  lat: number;
  lng: number;
  edgeIdx: number;
  t: number;
}

export interface DraftTerritorioParcial {
  puntos: DraftPoint[];
  geometria: string;
}

export interface MapDraft {
  manzanasById: Record<string, ManzanaMarcada>;
  territoriosSeleccionados: number[];
  territorioSeleccionado: number | null;
  datosParcialesGuardados: Record<number, DraftTerritorioParcial>;
  modoMarcado: ModoMarcado;
  predicacion: string;
  savedAt: number;
}

function isManzana(value: unknown): value is ManzanaMarcada {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m['id'] === 'string' && typeof m['nombreBloque'] === 'string' &&
    typeof m['color'] === 'string' && typeof m['territorioNumero'] === 'number';
}

function isDraftPoint(value: unknown): value is DraftPoint {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p['lat'] === 'number' && typeof p['lng'] === 'number';
}

function isDraft(value: unknown): value is MapDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  if (typeof draft['manzanasById'] !== 'object' || draft['manzanasById'] === null) return false;
  if (!Array.isArray(draft['territoriosSeleccionados'])) return false;
  if (typeof draft['modoMarcado'] !== 'string') return false;
  if (typeof draft['predicacion'] !== 'string') return false;
  if (!Object.values(draft['manzanasById']).every(isManzana)) return false;
  const parciales = draft['datosParcialesGuardados'];
  if (typeof parciales !== 'object' || parciales === null) return false;
  return Object.values(parciales as Record<number, Record<string, unknown>>).every(
    (t) => Array.isArray(t?.['puntos']) &&
      (t['puntos'] as unknown[]).every(isDraftPoint) &&
      typeof t?.['geometria'] === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class DraftMarksService {
  private get storage(): Storage | undefined {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  }

  guardar(draft: MapDraft): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      this.storage.removeItem(STORAGE_KEY);
    }
  }

  cargar(): MapDraft | null {
    if (!this.storage) return null;
    try {
      const data = this.storage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed: unknown = JSON.parse(data);
      if (isDraft(parsed)) return parsed;
    } catch {
      // fall through to discard
    }
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable; in-memory state is already empty.
    }
    return null;
  }

  eliminarTerritorios(nums: number[]): void {
    const draft = this.cargar();
    if (!draft) return;
    const set = new Set(nums);
    for (const [id, m] of Object.entries(draft.manzanasById)) {
      if (set.has(m.territorioNumero)) delete draft.manzanasById[id];
    }
    for (const num of set) {
      delete draft.datosParcialesGuardados[num];
    }
    draft.territoriosSeleccionados = draft.territoriosSeleccionados.filter(n => !set.has(n));
    if (draft.territorioSeleccionado !== null && set.has(draft.territorioSeleccionado)) {
      draft.territorioSeleccionado = draft.territoriosSeleccionados.length === 1
        ? draft.territoriosSeleccionados[0]
        : null;
    }
    draft.savedAt = Date.now();
    this.guardar(draft);
  }

  clear(): void {
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode).
      }
    }
  }

  tieneDraft(): boolean {
    return this.cargar() !== null;
  }
}