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
    } catch {
      // En caso de error (timeout, network, etc.), asumimos sesión inválida
      // para forzar re-login
      this.cache = {
        valid: false,
        expiresAt: Date.now() + AuthService.CACHE_TTL_MS
      };
      return false;
    }
  }

  /**
   * Invalida la caché de validación (útil después de login/logout).
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
