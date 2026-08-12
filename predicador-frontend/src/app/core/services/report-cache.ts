import { Injectable } from '@angular/core';
import type { Reporte } from '../models/models';

const STORAGE_KEY = 'predicador_reports_cache';

interface ReportCacheEntry {
  report: Reporte;
  version: number;
}

function isCacheEntry(value: unknown): value is ReportCacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['report'] === 'object' && entry['report'] !== null &&
    typeof entry['version'] === 'number' &&
    typeof entry['report'] !== 'string'
  );
}

function isCacheSchema(value: unknown): value is { savedAt: number; data: Record<string, ReportCacheEntry> } {
  if (typeof value !== 'object' || value === null) return false;
  const schema = value as Record<string, unknown>;
  return typeof schema['savedAt'] === 'number' && typeof schema['data'] === 'object';
}

@Injectable({ providedIn: 'root' })
export class ReportCacheService {
  private storage: Storage | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined;
  private readonly cache = new Map<number, Reporte>();

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    this.cache.clear();
    if (!this.storage) return;
    try {
      const data = this.storage.getItem(STORAGE_KEY);
      if (!data) return;
      const parsed: unknown = JSON.parse(data);
      if (!isCacheSchema(parsed)) {
        this.storage.removeItem(STORAGE_KEY);
        return;
      }
      for (const [num, entry] of Object.entries(parsed.data)) {
        if (isCacheEntry(entry)) {
          this.cache.set(Number(num), entry.report);
        }
      }
    } catch {
      this.safeRemove();
    }
  }

  getCache(): Map<number, Reporte> {
    return new Map(this.cache);
  }

  setTerritorio(numero: number, reporte: Reporte): void {
    if (!this.storage) return;
    const entry: ReportCacheEntry = { report: reporte, version: reporte.id };
    try {
      const data = this.readSchema();
      data.data[numero] = entry;
      data.savedAt = Date.now();
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.cache.set(numero, reporte);
    } catch {
      this.safeRemove();
    }
  }

  setTerritorios(entries: Map<number, Reporte>): void {
    for (const [num, reporte] of entries) {
      this.setTerritorio(num, reporte);
    }
  }

  removeTerritorios(nums: number[]): void {
    if (!this.storage) return;
    try {
      const data = this.readSchema();
      let changed = false;
      for (const num of nums) {
        if (num in data.data) {
          delete data.data[num];
          changed = true;
        }
      }
      if (!changed) return;
      data.savedAt = Date.now();
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      this.safeRemove();
    }
    for (const num of nums) this.cache.delete(num);
  }

  clear(): void {
    this.safeRemove();
    this.cache.clear();
  }

  hasData(): boolean {
    return this.cache.size > 0;
  }

  private readSchema(): { savedAt: number; data: Record<string, ReportCacheEntry> } {
    const data = this.storage?.getItem(STORAGE_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (isCacheSchema(parsed)) return parsed;
    }
    return { savedAt: 0, data: {} };
  }

  private safeRemove(): void {
    this.cache.clear();
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode); in-memory state is already clear.
      }
    }
  }
}