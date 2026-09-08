import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SessionValidationResponse {
  valid: boolean;
  role?: string;
  subject?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private sessionUrl = `${environment.apiUrl}/encargados/session`;
  
  private static readonly VALIDATION_TIMEOUT_MS = 3000;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
  
  private cache: { valid: boolean; expiresAt: number } | null = null;

  /**
   * Valida si la sesión actual es válida llamando al backend.
   * Usa caché para evitar llamadas repetidas y timeout para no bloquear.
   */
  async validateSession(): Promise<boolean> {
    // Verificar caché primero
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.valid;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<SessionValidationResponse>(this.sessionUrl).pipe(
          timeout(AuthService.VALIDATION_TIMEOUT_MS)
        )
      );

      // Cachear resultado exitoso
      this.cache = {
        valid: response.valid,
        expiresAt: Date.now() + AuthService.CACHE_TTL_MS
      };

      return response.valid;
    } catch (error) {
      const status = (error as { status?: number } | undefined)?.status;

      // Un 401 significa token ausente/inválido/expirado: la sesión realmente
      // ya no existe en el backend. Invalidarla localmente para forzar re-login.
      if (status === 401) {
        this.cache = {
          valid: false,
          expiresAt: Date.now() + AuthService.CACHE_TTL_MS
        };
        return false;
      }

      // 5xx (502/503 del gateway), timeout o error de red NO significan sesión
      // inválida: el servicio está temporalmente no disponible (p. ej. durante
      // el arranque en frío del stack, cuando los servicios aún no se registran
      // en Eureka y el gateway no puede resolver lb://reporting-service).
      // Cerrar la sesión aquí expulsaba al usuario injustamente. Mantener la
      // sesión y NO cachear el fallo para que la próxima validación reintente.
      this.cache = null;
      return true;
    }
  }

  /**
   * Invalida la caché de validación (útil después de login/logout).
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
