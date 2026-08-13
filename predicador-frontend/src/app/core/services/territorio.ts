import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Reporte, RegistroReporte, EstadoReporte, TipoSesion } from '../models/models';
import { ReportCacheService } from './report-cache';

interface ReportDto {
  id?: number;
  manzanaId?: string | null;
  fecha?: string;
  encargadoNombre: string;
  encargadoApellido?: string | null;
  sessionTime?: string | null;
  estado?: string;
  territorioNumero?: number;
  encargadoId?: number | null;
  totalManzanas?: number;
  manzanasMarcadas?: number;
  tipoSesion?: string;
  geometriaParcial?: string | null;
  puntosParciales?: string | null;
  manzanasIds?: string | null;
}

const BATCH_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class TerritorioService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/territories`;
  private readonly reportesUrl = `${environment.apiUrl}/reports`;
  private readonly reportCache = inject(ReportCacheService);

  /** Versions already validated this session (territorio -> id of last report). */
  private readonly versionsSeen = new Map<number, number>();

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(this.apiUrl));
  }

  async getAllGeoJson(): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' })
    );
  }

  async getColores(): Promise<Record<number, string>> {
    return firstValueFrom(this.http.get<Record<number, string>>(`${this.apiUrl}/colors`));
  }

  async asignarColor(numero: number, color: string): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.apiUrl}/${numero}/color`, { color })
    );
  }

  async crearReportes(registros: RegistroReporte[]): Promise<Reporte[]> {
    const dtos = registros.map(r => this.toReportDto(r));
    return (await firstValueFrom(
      this.http.post<ReportDto[]>(this.reportesUrl, dtos)
    ) ?? []).map(d => this.toReporte(d, d.territorioNumero ?? 0));
  }

  /** Synchronous snapshot from localStorage — paint the map instantly. */
  getReportesDesdeCache(nums: number[]): Map<number, Reporte[]> {
    const result = new Map<number, Reporte[]>();
    const cache = this.reportCache.getCache();
    for (const num of nums) {
      const reporte = cache.get(num);
      if (reporte) result.set(num, [reporte]);
    }
    return result;
  }

  async revalidarReportes(nums: number[]): Promise<Map<number, Reporte[]>> {
    const result = this.getReportesDesdeCache(nums);
    const sinRevisar = nums.filter(n => !this.versionsSeen.has(n));
    if (sinRevisar.length === 0) return result;

    const versiones = new Map<number, number>();
    try {
      for (let i = 0; i < sinRevisar.length; i += BATCH_SIZE) {
        const chunk = sinRevisar.slice(i, i + BATCH_SIZE);
        const query = chunk.map(n => `territorios=${n}`).join('&');
        const response = (await firstValueFrom(
          this.http.get<Record<string, number>>(`${this.reportesUrl}/versions?${query}`)
        )) ?? {};
        for (const [key, version] of Object.entries(response)) {
          versiones.set(Number(key), Number(version));
        }
      }
    } catch {
      // Offline: skip revalidation, paint from the persistent cache.
      return result;
    }

    for (const num of sinRevisar) {
      this.versionsSeen.set(num, versiones.get(num) ?? -1);
    }

    const cambiados = new Map<number, number>();
    for (const [num, version] of versiones) {
      const cacheado = this.reportCache.getCache().get(num);
      if (!cacheado || cacheado.id !== version) cambiados.set(num, version);
    }

    for (let i = 0; i < cambiados.size; i += BATCH_SIZE) {
      const chunk = Array.from(cambiados.keys()).slice(i, i + BATCH_SIZE);
      const query = chunk.map(n => `territorios=${n}`).join('&');
      const response = (await firstValueFrom(
        this.http.get<Record<string, ReportDto[]>>(`${this.reportesUrl}/batch?${query}`)
      )) ?? {};
      for (const num of chunk) {
        const reportes = (response[String(num)] ?? []).map(d => this.toReporte(d, num));
        const ultimo = this.elegirUltimo(reportes);
        if (ultimo) {
          this.reportCache.setTerritorio(num, ultimo);
          result.set(num, [ultimo]);
        } else {
          result.delete(num);
        }
      }
    }
    return result;
  }

  async getReportesPorTerritorios(territorios: number[]): Promise<Map<number, Reporte[]>> {
    const instantaneo = this.getReportesDesdeCache(territorios);
    const revalidado = await this.revalidarReportes(territorios);
    const merged = new Map(instantaneo);
    for (const [num, list] of revalidado) merged.set(num, list);
    return merged;
  }

  async getReportesPorTerritorio(territorioNumero: number): Promise<Reporte[]> {
    const cacheado = this.reportCache.getCache().get(territorioNumero);
    if (this.versionsSeen.get(territorioNumero) === -1 && !cacheado) return [];
    if (cacheado && this.versionsSeen.get(territorioNumero) === cacheado.id) return [cacheado];

    const dtos = await firstValueFrom(
      this.http.get<ReportDto[]>(`${this.reportesUrl}?territorioNumero=${territorioNumero}`)
    );
    const reportes = (dtos ?? []).map(d => this.toReporte(d, territorioNumero));
    const ultimo = this.elegirUltimo(reportes);
    if (ultimo) {
      this.reportCache.setTerritorio(territorioNumero, ultimo);
      this.versionsSeen.set(territorioNumero, ultimo.id);
    } else {
      this.versionsSeen.set(territorioNumero, -1);
    }
    return reportes;
  }

  /** Clears the persistent report cache + in-session version guard (used by reload). */
  limpiarCache(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
  }

  /** Logout hygiene: clears report cache + marks draft. Draft hook lands in Task 10. */
  logout(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
  }

  private elegirUltimo(reportes: Reporte[]): Reporte | undefined {
    let ultimo: Reporte | undefined;
    for (const r of reportes) {
      if (!ultimo || (r.fecha || '') > (ultimo.fecha || '')) ultimo = r;
    }
    return ultimo;
  }

  private toReportDto(r: RegistroReporte): ReportDto {
    return {
      manzanaId: r.manzanaId ?? null,
      encargadoNombre: r.encargadoNombre,
      encargadoApellido: r.encargadoApellido,
      sessionTime: r.sessionTime,
      estado: r.estado,
      territorioNumero: r.territorioNumero,
      encargadoId: r.encargadoId ?? null,
      totalManzanas: r.totalManzanas,
      manzanasMarcadas: r.manzanasMarcadas,
      tipoSesion: r.tipoSesion,
      geometriaParcial: r.geometriaParcial ?? null,
      puntosParciales: r.puntosParciales ?? null,
      manzanasIds: r.manzanasIds ?? null
    };
  }

  private toReporte(d: ReportDto, fallbackNumero: number): Reporte {
    return {
      id: d.id ?? 0,
      manzanaId: d.manzanaId ?? null,
      fecha: d.fecha ?? '',
      encargadoId: d.encargadoId ?? 0,
      encargadoNombre: d.encargadoNombre,
      encargadoApellido: d.encargadoApellido ?? '',
      sessionTime: d.sessionTime ?? '',
      estado: (d.estado as EstadoReporte) ?? 'completed',
      territorioNumero: d.territorioNumero ?? fallbackNumero,
      totalManzanas: d.totalManzanas ?? 0,
      manzanasMarcadas: d.manzanasMarcadas ?? 0,
      tipoSesion: (d.tipoSesion as TipoSesion) ?? 'completa',
      geometriaParcial: d.geometriaParcial ?? null,
      puntosParciales: d.puntosParciales ?? null,
      manzanasIds: d.manzanasIds ?? null
    };
  }
}