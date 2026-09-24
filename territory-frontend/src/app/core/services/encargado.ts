import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from './auth-token';
import { MUTATION_RETRY_DELAY_MS, retryTransient } from '../utils/http-retry';

export interface EncargadoDto {
  id: number | null;
  nombre: string;
  apellido: string;
  avatar: number;
  telefono: string | null;
  activo: boolean | null;
}

/**
 * Backend response shape after Fase 1 backend changes. The DTO is wrapped and
 * The session is established by the HttpOnly cookie; the token is never
 * persisted or read by the frontend.
 */
interface LoginResponse {
  encargado?: EncargadoDto;
  token?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EncargadoService {
  private readonly http = inject(HttpClient);
  private authToken = inject(AuthTokenService);
  private apiUrl = `${environment.apiUrl}/encargados`;

  async buscarOCrear(
    nombre: string,
    apellido: string,
    telefono: string | null,
  ): Promise<EncargadoDto> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse | EncargadoDto>(`${this.apiUrl}/buscar-crear`, {
        nombre,
        apellido,
        telefono,
      }).pipe(retryTransient(1, MUTATION_RETRY_DELAY_MS)),
    );
    return this.extract(response);
  }

  /** `pin` solo se envía si el encargado tiene uno (el backend responde `pin_requerido`). */
  async loginByPhone(telefono: string, pin?: string): Promise<EncargadoDto> {
    const body = pin ? { telefono, pin } : { telefono };
    const response = await firstValueFrom(
      this.http.post<LoginResponse | EncargadoDto>(`${this.apiUrl}/login`, body)
        .pipe(retryTransient(1, MUTATION_RETRY_DELAY_MS)),
    );
    return this.extract(response);
  }

  /**
   * Unwrap either shape and, if a token comes with the response, persist it
   * as the current session so the auth interceptor can attach it downstream.
   */
  private extract(response: LoginResponse | EncargadoDto): EncargadoDto {
    if (this.isLoginResponse(response)) {
      this.authToken.set('encargado');
      // encargado is guaranteed present when isLoginResponse returns true.
      return response.encargado as EncargadoDto;
    }
    return response;
  }

  private isLoginResponse(x: LoginResponse | EncargadoDto): x is LoginResponse {
    return (
      typeof x === 'object' &&
      x !== null &&
      'encargado' in x &&
      typeof (x as LoginResponse).encargado === 'object'
    );
  }
}

/**
 * Motivo de un rechazo de login/registro (`code` del ProblemDetail):
 * `pin_requerido`, `pin_incorrecto`, `pin_bloqueado`, `inactivo`,
 * `registro_cerrado`, `ya_registrado`, `no_encontrado`.
 */
export function codigoLogin(error: unknown): { code: string | null; detail: string | null } {
  const cuerpo = (error as { error?: { code?: unknown; detail?: unknown } } | null)?.error;
  return {
    code: typeof cuerpo?.code === 'string' ? cuerpo.code : null,
    detail: typeof cuerpo?.detail === 'string' ? cuerpo.detail : null,
  };
}
