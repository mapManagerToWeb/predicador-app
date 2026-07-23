import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Territorio, RegistroReporte, Reporte } from '../models/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TerritorioService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/territories`;
  private reportesUrl = `${environment.apiUrl}/reports`;

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(`${this.apiUrl}`));
  }

  async getTerritorio(numero: number): Promise<Territorio> {
    return firstValueFrom(this.http.get<Territorio>(`${this.apiUrl}/${numero}`));
  }

  async getGeoJsonTerritorio(numero: number): Promise<string> {
    return firstValueFrom(this.http.get(`${this.apiUrl}/${numero}/geojson`, { responseType: 'text' }));
  }

  async getAllGeoJson(): Promise<string> {
    return firstValueFrom(this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' }));
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

  async getReportesHoy(): Promise<Reporte[]> {
    return firstValueFrom(this.http.get<Reporte[]>(`${this.reportesUrl}/today`));
  }
}
