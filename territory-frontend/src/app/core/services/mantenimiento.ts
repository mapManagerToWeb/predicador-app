import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Toast } from './toast';

export interface TextoBiblico {
  cita: string;
  texto: string;
}

/**
 * Textos de la pantalla «Estamos haciendo mejoras», de la Traducción del Nuevo
 * Mundo (edición de estudio, jw.org), copiados tal cual. Van rotando: cada vez
 * que aparece la pantalla sale el siguiente.
 */
export const TEXTOS_MANTENIMIENTO: readonly TextoBiblico[] = [
  { cita: 'Gálatas 6:9', texto: 'Así que no dejemos de hacer lo que está bien, porque al debido tiempo cosecharemos si no nos cansamos.' },
  { cita: 'Colosenses 3:23', texto: 'Cualquier cosa que ustedes hagan, háganla con toda el alma como si fuera para Jehová y no para los hombres…' },
  { cita: '1 Corintios 14:40', texto: 'Pero háganlo todo de forma digna y ordenada.' },
  { cita: 'Eclesiastés 3:1', texto: 'Para todo hay un tiempo determinado; hay un tiempo para cada actividad bajo los cielos…' },
  { cita: 'Eclesiastés 7:8', texto: 'Es mejor el final de un asunto que su principio. Es mejor ser paciente que ser arrogante.' },
];

/** Antes de mostrar la pantalla se vuelve a probar: un corte de un segundo no la muestra. */
export const CONFIRMAR_MS = 2_000;
/** Mientras está la pantalla, cada cuánto se prueba si el servidor ya volvió. */
export const REINTENTAR_MS = 20_000;

const CLAVE_TEXTO = 'territorios_texto_mantenimiento';

/**
 * Pantalla «Estamos haciendo mejoras»: cuando el servidor no responde (se está
 * actualizando: 502, 503 o 504), en vez de errores se muestra un aviso con un
 * texto bíblico y la app vuelve sola apenas el servidor responde. Lo marcado ya
 * queda guardado en el teléfono. No aparece en el panel de administración.
 */
@Injectable({ providedIn: 'root' })
export class Mantenimiento {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(Toast);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly activo = signal(false);
  readonly texto = signal<TextoBiblico>(TEXTOS_MANTENIMIENTO[0]);

  private comprobando = false;
  private reloj: ReturnType<typeof setInterval> | null = null;

  /** Una respuesta 502/503/504: si el servidor sigue sin responder, se muestra la pantalla. */
  avisarCaida(): void {
    if (!this.navegador || this.activo() || this.comprobando) return;
    this.comprobando = true;
    setTimeout(() => {
      void this.responde().then(ok => {
        this.comprobando = false;
        if (!ok) this.mostrar();
      });
    }, CONFIRMAR_MS);
  }

  /** «Intentar ahora». */
  async reintentar(): Promise<void> {
    if (await this.responde()) this.ocultar(true);
  }

  private mostrar(): void {
    this.texto.set(this.siguienteTexto());
    this.activo.set(true);
    this.reloj = setInterval(() => void this.reintentar(), REINTENTAR_MS);
  }

  private ocultar(avisar: boolean): void {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    if (!this.activo()) return;
    this.activo.set(false);
    if (avisar) this.toast.show('Listo, ya puedes seguir', 3000, 'success');
  }

  /** El servidor responde (cualquier respuesta que no sea de caída). */
  private async responde(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.get(`${environment.apiUrl}/encargados/registro`, { headers: { 'ngsw-bypass': 'true' } }),
      );
      return true;
    } catch (e) {
      const estado = (e as { status?: number }).status ?? 0;
      return estado !== 0 && estado !== 502 && estado !== 503 && estado !== 504;
    }
  }

  private siguienteTexto(): TextoBiblico {
    let i: number;
    try {
      i = (Number(localStorage.getItem(CLAVE_TEXTO)) + 1) % TEXTOS_MANTENIMIENTO.length || 0;
      localStorage.setItem(CLAVE_TEXTO, String(i));
    } catch {
      i = Math.floor(Math.random() * TEXTOS_MANTENIMIENTO.length);
    }
    return TEXTOS_MANTENIMIENTO[i];
  }
}
