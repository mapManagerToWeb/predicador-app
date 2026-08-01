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

  private geoJsonCache: string | null = null;
  private reportCache = new Map<number, Reporte[]>();

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(this.apiUrl));
  }

  async getAllGeoJson(): Promise<string> {
    if (this.geoJsonCache !== null) return this.geoJsonCache;
    const text = await firstValueFrom(
      this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' })
    );
    this.geoJsonCache = text;
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
    if (cached !== undefined) return cached;
    const reportes = await firstValueFrom(
      this.http.get<Reporte[]>(`${this.reportesUrl}?territorioNumero=${territorioNumero}`)
    );
    this.reportCache.set(territorioNumero, reportes);
    return reportes;
  }

  async getReportesPorTerritorios(territorios: number[]): Promise<Map<number, Reporte[]>> {
    const uncached = territorios.filter(n => !this.reportCache.has(n));

    if (uncached.length > 0) {
      const params = uncached.map(n => `territorios=${n}`).join('&');
      const response = await firstValueFrom(
        this.http.get<Record<number, Reporte[]>>(`${this.reportesUrl}/batch?${params}`)
      );
      for (const [key, reports] of Object.entries(response)) {
        this.reportCache.set(Number(key), reports);
      }
    }

    const result = new Map<number, Reporte[]>();
    for (const n of territorios) {
      result.set(n, this.reportCache.get(n) ?? []);
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
