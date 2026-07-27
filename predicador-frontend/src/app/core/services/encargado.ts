import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EncargadoDto {
  id: number | null;
  nombre: string;
  apellido: string;
  avatar: number;
  telefono: string | null;
  activo: boolean | null;
}

@Injectable({ providedIn: 'root' })
export class EncargadoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/encargados`;

  async buscarOCrear(
    nombre: string,
    apellido: string,
    telefono: string | null
  ): Promise<EncargadoDto> {
    return firstValueFrom(
      this.http.post<EncargadoDto>(`${this.apiUrl}/buscar-crear`, {
        nombre,
        apellido,
        telefono,
      })
    );
  }

  async loginByPhone(telefono: string): Promise<EncargadoDto> {
    return firstValueFrom(
      this.http.post<EncargadoDto>(`${this.apiUrl}/login`, { telefono })
    );
  }
}
