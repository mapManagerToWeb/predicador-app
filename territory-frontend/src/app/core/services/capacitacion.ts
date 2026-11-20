import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Cada cuánto se vuelve a preguntar si hay una capacitación (mientras la pantalla está a la vista). */
export const REVISAR_CAPACITACION_MS = 60_000;

/**
 * El aviso «capacitación en curso» de la app y del visor. Durante una
 * capacitación (la empieza el administrador en el panel) todo lo que se envía
 * es de prueba y se borra al terminar: los hermanos tienen que saberlo.
 * Sin señal, o con un servidor que no lo conoce, simplemente no hay aviso.
 */
@Injectable({ providedIn: 'root' })
export class Capacitacion {
  private readonly http = inject(HttpClient);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly activa = signal(false);
  readonly desde = signal<string | null>(null);

  private pantallas = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') void this.revisar();
  };

  /** Una pantalla empieza a mostrar el aviso; devuelve con qué dejar de mirarlo. */
  vigilar(): () => void {
    if (!this.navegador) return () => undefined;
    this.pantallas++;
    if (this.pantallas === 1) {
      void this.revisar();
      this.reloj = setInterval(this.alVolver, REVISAR_CAPACITACION_MS);
      document.addEventListener('visibilitychange', this.alVolver);
    }
    let soltada = false;
    return () => {
      if (soltada) return;
      soltada = true;
      this.pantallas--;
      if (this.pantallas > 0) return;
      if (this.reloj) clearInterval(this.reloj);
      this.reloj = null;
      document.removeEventListener('visibilitychange', this.alVolver);
    };
  }

  async revisar(): Promise<void> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ activa: boolean; desde: string | null }>(`${environment.apiUrl}/reports/public/capacitacion`, {
          headers: { 'ngsw-bypass': 'true' },
        }),
      );
      this.activa.set(r?.activa === true);
      this.desde.set(r?.activa ? (r.desde ?? null) : null);
    } catch {
      // Sin señal: se queda como estaba (el próximo intento lo corrige).
    }
  }
}
