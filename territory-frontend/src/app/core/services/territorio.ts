import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  REVALIDATION_RETRY_DELAY_MS,
  MUTATION_RETRY_DELAY_MS,
  retryTransient,
} from '../utils/http-retry';
import type { Reporte, RegistroReporte, EstadoReporte, TipoSesion } from '../models/models';
import { ReportCacheService } from './report-cache';
import { DraftMarksService } from './map-draft';

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
  private readonly draftMarksService = inject(DraftMarksService);

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
        .pipe(retryTransient(1, MUTATION_RETRY_DELAY_MS))
    ) ?? []).map(d => this.toReporte(d, d.territorioNumero ?? 0));
  }

  /** Compensación ACID: borra reportes recién creados si el envío por WhatsApp falla. */
  async eliminarReportes(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await firstValueFrom(
      this.http.delete<void>(this.reportesUrl, { params: { ids: ids.join(',') } })
        .pipe(retryTransient(1, MUTATION_RETRY_DELAY_MS))
    );
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
    const chunks: number[][] = [];
    for (let i = 0; i < sinRevisar.length; i += BATCH_SIZE) {
      chunks.push(sinRevisar.slice(i, i + BATCH_SIZE));
    }

    // Fetch all chunks in parallel instead of serially awaiting each one,
    // so the revalidation network chain is one round-trip deep, not N deep.
    const responses = await Promise.allSettled(
      chunks.map(chunk =>
        firstValueFrom(
          this.http.get<Record<string, number>>(
            `${this.reportesUrl}/versions?${chunk.map(n => `territorios=${n}`).join('&')}`
          ).pipe(retryTransient(2, REVALIDATION_RETRY_DELAY_MS))
        )
      )
    );
    const allFailed = responses.every(r => r.status === 'rejected');
    if (allFailed) {
      // Offline: skip revalidation, paint from the persistent cache.
      return result;
    }
    for (const response of responses) {
      if (response.status !== 'fulfilled' || !response.value) continue;
      for (const [key, version] of Object.entries(response.value)) {
        versiones.set(Number(key), Number(version));
      }
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
          .pipe(retryTransient(2, REVALIDATION_RETRY_DELAY_MS))
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

  /** True when the persistent report cache holds any entry (used before reconciling). */
  hasCacheReportes(): boolean {
    return this.reportCache.hasData();
  }

  /**
   * Detecta territorios borrados en el backend y los elimina del cache de
   * localStorage (y del guard de versiones en sesión), devolviendo el conjunto
   * de números todavía vigentes. Best-effort: si el backend no responde se
   * devuelve null y no se poda nada — el modo offline depende del cache.
   */
  async reconciliarCacheConBackend(): Promise<Set<number> | null> {
    let numeros: number[];
    try {
      numeros = await this.getNumerosTerritorios();
    } catch {
      return null;
    }
    const vigentes = new Set(numeros);
    const obsoletos = [...this.reportCache.getCache().keys()].filter(n => !vigentes.has(n));
    if (obsoletos.length > 0) {
      this.reportCache.removeTerritorios(obsoletos);
      for (const n of obsoletos) this.versionsSeen.delete(n);
    }
    return vigentes;
  }

  /** Logout hygiene: clears report cache + marks draft. */
  logout(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
    this.draftMarksService.clear();
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