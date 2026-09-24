import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  CalidadDatos,
  EncargadoAdmin,
  EncargadoRequest,
  EnvioWhatsApp,
  ManzanaGuardada,
  ManzanaRequest,
  ManzanasCollection,
  ReporteAdmin,
} from '../admin.models';

/**
 * El service worker cachea /api/v1/territories/** con estrategia
 * "performance" (1 h) para el mapa de los encargados. El panel tiene que ver
 * siempre el dato vivo, así que todas sus peticiones saltan el SW.
 */
const SIN_SW = new HttpHeaders({ 'ngsw-bypass': 'true' });

/** Cliente HTTP de los endpoints /admin (todos exigen sesión de administrador). */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly territorios = `${environment.apiUrl}/territories`;
  private readonly reportes = `${environment.apiUrl}/reports/admin`;
  private readonly encargados = `${environment.apiUrl}/encargados/admin`;

  // ── Territorios y manzanas ──

  manzanas(): Promise<ManzanasCollection> {
    return this.get<ManzanasCollection>(`${this.territorios}/admin/manzanas`);
  }

  crearManzana(req: ManzanaRequest): Promise<ManzanaGuardada> {
    return this.send(this.http.post<ManzanaGuardada>(`${this.territorios}/admin/manzanas`, req, { headers: SIN_SW }));
  }

  actualizarManzana(id: number, req: ManzanaRequest): Promise<ManzanaGuardada> {
    return this.send(
      this.http.put<ManzanaGuardada>(`${this.territorios}/admin/manzanas/${id}`, req, { headers: SIN_SW }),
    );
  }

  eliminarManzana(id: number): Promise<void> {
    return this.send(this.http.delete<void>(`${this.territorios}/admin/manzanas/${id}`, { headers: SIN_SW }));
  }

  repararManzana(id: number): Promise<ManzanaGuardada> {
    return this.send(
      this.http.post<ManzanaGuardada>(`${this.territorios}/admin/manzanas/${id}/reparar`, {}, { headers: SIN_SW }),
    );
  }

  reasignarManzanas(ids: number[], territorio: number): Promise<{ actualizadas: number }> {
    return this.send(
      this.http.post<{ actualizadas: number }>(
        `${this.territorios}/admin/manzanas/reasignar`,
        { ids, territorio },
        { headers: SIN_SW },
      ),
    );
  }

  eliminarTerritorio(numero: number): Promise<{ eliminadas: number }> {
    return this.send(
      this.http.delete<{ eliminadas: number }>(`${this.territorios}/admin/territorios/${numero}`, { headers: SIN_SW }),
    );
  }

  importarManzanas(featureCollection: string): Promise<{ creadas: number; territorios: number[] }> {
    return this.send(
      this.http.post<{ creadas: number; territorios: number[] }>(`${this.territorios}/admin/importar`, featureCollection, {
        headers: SIN_SW.set('Content-Type', 'application/json'),
      }),
    );
  }

  calidad(): Promise<CalidadDatos> {
    return this.get<CalidadDatos>(`${this.territorios}/admin/calidad`);
  }

  /**
   * Colores vigentes. El endpoint público lleva Cache-Control de 10 min para
   * el mapa; el parámetro `v` evita la copia del navegador tras un cambio.
   */
  colores(): Promise<Record<number, string>> {
    return this.get<Record<number, string>>(`${this.territorios}/colors`, new HttpParams().set('v', Date.now()));
  }

  asignarColor(numero: number, color: string): Promise<void> {
    return this.send(this.http.put<void>(`${this.territorios}/${numero}/color`, { color }, { headers: SIN_SW }));
  }

  // ── Reportes ──

  reportesEntre(desde: Date, hasta: Date): Promise<ReporteAdmin[]> {
    const params = new HttpParams().set('desde', desde.toISOString()).set('hasta', hasta.toISOString());
    return this.get<ReporteAdmin[]>(this.reportes, params);
  }

  eliminarReportes(ids: number[]): Promise<{ eliminados: number }> {
    const params = new HttpParams().set('ids', ids.join(','));
    return this.send(this.http.delete<{ eliminados: number }>(this.reportes, { params, headers: SIN_SW }));
  }

  enviosWhatsApp(): Promise<EnvioWhatsApp[]> {
    return this.get<EnvioWhatsApp[]>(`${this.reportes}/whatsapp`);
  }

  // ── Encargados y credenciales ──

  listarEncargados(): Promise<EncargadoAdmin[]> {
    return this.get<EncargadoAdmin[]>(this.encargados);
  }

  crearEncargado(req: EncargadoRequest): Promise<EncargadoAdmin> {
    return this.send(this.http.post<EncargadoAdmin>(this.encargados, req, { headers: SIN_SW }));
  }

  actualizarEncargado(id: number, req: EncargadoRequest): Promise<EncargadoAdmin> {
    return this.send(this.http.put<EncargadoAdmin>(`${this.encargados}/${id}`, req, { headers: SIN_SW }));
  }

  eliminarEncargado(id: number): Promise<void> {
    return this.send(this.http.delete<void>(`${this.encargados}/${id}`, { headers: SIN_SW }));
  }

  generarPin(id: number): Promise<{ pin: string }> {
    return this.send(this.http.post<{ pin: string }>(`${this.encargados}/${id}/pin`, {}, { headers: SIN_SW }));
  }

  quitarPin(id: number): Promise<EncargadoAdmin> {
    return this.send(this.http.delete<EncargadoAdmin>(`${this.encargados}/${id}/pin`, { headers: SIN_SW }));
  }

  desbloquearEncargado(id: number): Promise<EncargadoAdmin> {
    return this.send(this.http.post<EncargadoAdmin>(`${this.encargados}/${id}/desbloquear`, {}, { headers: SIN_SW }));
  }

  fusionarEncargados(origenId: number, destinoId: number): Promise<EncargadoAdmin> {
    return this.send(
      this.http.post<EncargadoAdmin>(`${this.encargados}/${origenId}/fusionar/${destinoId}`, {}, { headers: SIN_SW }),
    );
  }

  configuracion(): Promise<{ registroAbierto: boolean }> {
    return this.get<{ registroAbierto: boolean }>(`${this.encargados}/config`);
  }

  setRegistroAbierto(registroAbierto: boolean): Promise<{ registroAbierto: boolean }> {
    return this.send(
      this.http.put<{ registroAbierto: boolean }>(`${this.encargados}/config`, { registroAbierto }, { headers: SIN_SW }),
    );
  }

  private get<T>(url: string, params?: HttpParams): Promise<T> {
    return this.send(this.http.get<T>(url, { params, headers: SIN_SW }));
  }

  private send<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }
}

/**
 * Mensaje legible de un error del backend: los endpoints responden
 * ProblemDetail, cuyo `detail` ya viene redactado para el usuario.
 */
export function mensajeDeError(error: unknown, porDefecto = 'No se pudo completar la operación'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Servidor no disponible. Revisá la conexión.';
    const cuerpo: unknown = error.error;
    if (cuerpo && typeof cuerpo === 'object') {
      const problema = cuerpo as { detail?: unknown; errors?: { field: string; message: string }[] };
      if (Array.isArray(problema.errors) && problema.errors.length > 0) {
        return problema.errors.map(e => e.message).join('. ');
      }
      if (typeof problema.detail === 'string' && problema.detail.trim()) return problema.detail;
    }
    if (error.status === 403) return 'Tu sesión de administrador no tiene permiso para esto.';
  }
  return porDefecto;
}
