import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MUTATION_RETRY_DELAY_MS, retryTransient } from '../utils/http-retry';
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
  estado?: EstadoReporte | null;
  territorioNumero?: number;
  encargadoId?: number | null;
  totalManzanas?: number;
  manzanasMarcadas?: number;
  tipoSesion?: TipoSesion | null;
  geometriaParcial?: string | null;
  puntosParciales?: string | null;
  manzanasIds?: string | null;
  inicioSesion?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TerritorioService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/territories`;
  private readonly reportesUrl = `${environment.apiUrl}/reports`;
  private readonly reportCache = inject(ReportCacheService);
  private readonly draftMarksService = inject(DraftMarksService);

  /** Versions already validated this session (territorio -> id of last report). */
  private readonly versionsSeen = new Map<number, number>();

  async getAllGeoJson(): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' })
    );
  }

  async getColores(): Promise<Record<number, string>> {
    return firstValueFrom(this.http.get<Record<number, string>>(`${this.apiUrl}/colors`));
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

  /** Sesión vencida: olvida los reportes cacheados, pero no lo marcado sin enviar. */
  olvidarCache(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
  }

  /** Logout hygiene: clears report cache + marks draft. */
  logout(): void {
    this.olvidarCache();
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
      manzanasIds: r.manzanasIds ?? null,
      inicioSesion: r.inicioSesion ?? null
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
      estado: d.estado ?? 'completed',
      territorioNumero: d.territorioNumero ?? fallbackNumero,
      totalManzanas: d.totalManzanas ?? 0,
      manzanasMarcadas: d.manzanasMarcadas ?? 0,
      tipoSesion: d.tipoSesion ?? 'completa',
      geometriaParcial: d.geometriaParcial ?? null,
      puntosParciales: d.puntosParciales ?? null,
      manzanasIds: d.manzanasIds ?? null
    };
  }
}