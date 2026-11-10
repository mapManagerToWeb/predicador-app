import { Injectable } from '@angular/core';
import type { EstadoTerritorioPublico } from '../map/estado-publico';

const STORAGE_KEY = 'territory_practice_draft';

/** Lo guardado en la práctica se borra solo tras 7 días sin volver a guardar. */
export const VIGENCIA_PRACTICA_MS = 7 * 24 * 60 * 60 * 1000;

interface PracticaGuardada {
  v: 1;
  savedAt: number;
  datos: unknown;
}

/**
 * Lo que guarda `/practice`: el borrador sin enviar y los reportes simulados.
 * Los reportes simulados viven acá (no en el estado real) para que al volver a
 * entrar se sigan viendo los territorios trabajados en la práctica.
 */
export interface PracticaDatos {
  borrador: unknown;
  estados: EstadoTerritorioPublico[];
}

function esEstadoPractica(valor: unknown): valor is EstadoTerritorioPublico {
  if (!valor || typeof valor !== 'object') return false;
  return Number.isInteger((valor as Partial<EstadoTerritorioPublico>).territorio);
}

/**
 * Lee lo guardado por la práctica. Acepta el formato anterior (solo el
 * borrador) para no perder marcas si alguien ya tenía datos guardados.
 */
export function leerPracticaDatos(valor: unknown): PracticaDatos {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    const v = valor as Record<string, unknown>;
    if ('borrador' in v || 'estados' in v) {
      return {
        borrador: v['borrador'] ?? null,
        estados: Array.isArray(v['estados']) ? v['estados'].filter(esEstadoPractica) : [],
      };
    }
  }
  return { borrador: valor, estados: [] };
}

/**
 * Almacén del modo práctica (`/practice`). Es a propósito independiente del
 * borrador real: lo de la práctica nunca se mezcla con lo que el encargado
 * marcó de verdad, y se borra solo a los 7 días.
 */
@Injectable({ providedIn: 'root' })
export class PracticeDraftService {
  private get storage(): Storage | undefined {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  }

  guardar(valor: unknown, ahora = Date.now()): void {
    const guardado: PracticaGuardada = { v: 1, savedAt: ahora, datos: valor };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(guardado));
    } catch {
      this.clear();
    }
  }

  /** Lo guardado, o null si no hay, está roto o ya venció. */
  cargar(ahora = Date.now()): unknown {
    const guardado = this.leer();
    if (!guardado) return null;
    if (ahora - guardado.savedAt > VIGENCIA_PRACTICA_MS) {
      this.clear();
      return null;
    }
    return guardado.datos;
  }

  /** Borra el guardado si ya pasaron los 7 días (se llama al arrancar la app). */
  limpiarSiVencio(ahora = Date.now()): void {
    const guardado = this.leer();
    if (guardado && ahora - guardado.savedAt > VIGENCIA_PRACTICA_MS) this.clear();
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Sin almacenamiento (modo privado) no hay nada que borrar.
    }
  }

  private leer(): PracticaGuardada | null {
    try {
      const texto = this.storage?.getItem(STORAGE_KEY);
      if (!texto) return null;
      const valor: unknown = JSON.parse(texto);
      if (!valor || typeof valor !== 'object') return null;
      const guardado = valor as Partial<PracticaGuardada>;
      return guardado.v === 1 && typeof guardado.savedAt === 'number' && Number.isFinite(guardado.savedAt)
        ? (guardado as PracticaGuardada)
        : null;
    } catch {
      this.clear();
      return null;
    }
  }
}
