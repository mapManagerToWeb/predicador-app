import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RegistroReporte, Reporte } from '../models/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TerritorioService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/territories`;
  private reportesUrl = `${environment.apiUrl}/reports`;

  private geoJsonCache: { text: string; expiresAt: number } | null = null;
  private reportCache = new Map<number, { reportes: Reporte[]; expiresAt: number }>();

  /**
   * Chunk size for `/reports/batch`. El backend limita el batch a
   * `ReportService.MAX_BATCH_SIZE` (100 territorios) para evitar URLs
   * abusivas; el mapa puede tener más de 100 territorios visibles, así que
   * las peticiones se trocean para no recibir un 400 y perder el restore.
   */
  private static readonly BATCH_CHUNK_SIZE = 50;

  /**
   * TTL de la caché en memoria: evita que datos de una sesión anterior queden
   * "frescos" indefinidamente sin reintentar contra el backend.
   */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private isCacheFresh(expiresAt: number | undefined): boolean {
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(this.apiUrl));
  }

  async getAllGeoJson(): Promise<string> {
    if (this.geoJsonCache && this.isCacheFresh(this.geoJsonCache.expiresAt)) {
      return this.geoJsonCache.text;
    }
    const text = await firstValueFrom(
      this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' })
    );
    this.geoJsonCache = { text, expiresAt: Date.now() + TerritorioService.CACHE_TTL_MS };
    return text;
  }

  invalidateGeoJsonCache(): void {
    this.geoJsonCache = null;
  }

  async getColores(): Promise<Record<number, string>> {
    return firstValueFrom(this.http.get<Record<number, string>>(`${this.apiUrl}/colors`));
  }

  async asignarColor(numero: number, color: string): Promise<void> {
    await firstValueFrom(this.http.put(`${this.apiUrl}/${numero}/color`, { color }));
    // El color viaja dentro del GeoJSON; invalidar la caché para que el mapa
    // refleje el nuevo color sin recargar la página.
    this.invalidateGeoJsonCache();
  }

  async crearReportes(reportes: RegistroReporte[]): Promise<Reporte[]> {
    const saved = await firstValueFrom(this.http.post<Reporte[]>(this.reportesUrl, reportes));
    for (const r of saved) {
      this.invalidateReportCache(r.territorioNumero);
    }
    return saved;
  }

  async getReportesPorTerritorio(territorioNumero: number): Promise<Reporte[]> {
    const cached = this.reportCache.get(territorioNumero);
    if (cached && this.isCacheFresh(cached.expiresAt)) return cached.reportes;
    const reportes = await firstValueFrom(
      this.http.get<Reporte[]>(`${this.reportesUrl}?territorioNumero=${territorioNumero}`)
    );
    this.reportCache.set(territorioNumero, {
      reportes,
      expiresAt: Date.now() + TerritorioService.CACHE_TTL_MS,
    });
    return reportes;
  }

  async getReportesPorTerritorios(territorios: number[]): Promise<Map<number, Reporte[]>> {
    const uncached = territorios.filter(n => {
      const cached = this.reportCache.get(n);
      return !cached || !this.isCacheFresh(cached.expiresAt);
    });

    if (uncached.length > 0) {
      for (let i = 0; i < uncached.length; i += TerritorioService.BATCH_CHUNK_SIZE) {
        const chunk = uncached.slice(i, i + TerritorioService.BATCH_CHUNK_SIZE);
        const params = chunk.map(n => `territorios=${n}`).join('&');
        const response = await firstValueFrom(
          this.http.get<Record<number, Reporte[]>>(`${this.reportesUrl}/batch?${params}`)
        );
        const expiresAt = Date.now() + TerritorioService.CACHE_TTL_MS;
        for (const [key, reports] of Object.entries(response)) {
          this.reportCache.set(Number(key), { reportes: reports, expiresAt });
        }
      }
    }

    const result = new Map<number, Reporte[]>();
    for (const n of territorios) {
      result.set(n, this.reportCache.get(n)?.reportes ?? []);
    }
    return result;
  }

  invalidateReportCache(territorioNumero?: number): void {
    if (territorioNumero !== undefined) {
      this.reportCache.delete(territorioNumero);
    } else {
      this.reportCache.clear();
    }
  }

  invalidateAll(): void {
    this.geoJsonCache = null;
    this.reportCache.clear();
  }
}
