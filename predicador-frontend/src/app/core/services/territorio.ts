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

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(`${this.apiUrl}`));
  }

  async getAllGeoJson(): Promise<string> {
    if (this.geoJsonCache !== null) return this.geoJsonCache;
    const text = await firstValueFrom(this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' }));
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
    return firstValueFrom(this.http.post<Reporte[]>(this.reportesUrl, reportes));
  }

  async getReportesPorTerritorio(territorioNumero: number): Promise<Reporte[]> {
    return firstValueFrom(this.http.get<Reporte[]>(`${this.reportesUrl}?territorioNumero=${territorioNumero}`));
  }
}
