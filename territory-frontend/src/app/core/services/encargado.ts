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
  private http = inject(HttpClient);
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

  async loginByPhone(telefono: string): Promise<EncargadoDto> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse | EncargadoDto>(`${this.apiUrl}/login`, { telefono })
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
