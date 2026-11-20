import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Intensidad de lo predicado: por defecto y los límites (los mismos del servidor). */
export const OPACIDAD_PREDICADAS_POR_DEFECTO = 0.6;
export const OPACIDAD_PREDICADAS_MINIMA = 0.3;
export const OPACIDAD_PREDICADAS_MAXIMA = 0.95;

const CLAVE = 'territorios_opacidad_predicadas';

/** Dentro de los límites y con dos decimales; lo que no es un número vuelve al valor por defecto. */
export function limpiarOpacidad(valor: unknown): number {
  const v = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(v)) return OPACIDAD_PREDICADAS_POR_DEFECTO;
  return Math.round(Math.min(OPACIDAD_PREDICADAS_MAXIMA, Math.max(OPACIDAD_PREDICADAS_MINIMA, v)) * 100) / 100;
}

/**
 * La franja de una calle predicada va más suave que una manzana entera (la
 * calle se remarca encima con una línea): nunca más fuerte que lo completo.
 */
export function opacidadFranja(opacidad: number): number {
  return Math.round(opacidad * 0.6 * 100) / 100;
}

/**
 * Qué tan fuerte se pintan las manzanas predicadas en el mapa de los hermanos
 * y en el visor. La elige el administrador en el panel (algunos hermanos las
 * veían «muy claritas»). Se guarda en el teléfono para que sin señal se vea
 * igual; mientras no se sabe, va el valor por defecto.
 */
@Injectable({ providedIn: 'root' })
export class Apariencia {
  private readonly http = inject(HttpClient);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  readonly opacidadPredicadas = signal(this.leerGuardada());
  private pedida: Promise<void> | null = null;

  /** Pide la intensidad al servidor (una vez por pantalla abierta). */
  cargar(): Promise<void> {
    if (!this.navegador) return Promise.resolve();
    this.pedida ??= this.pedir().finally(() => (this.pedida = null));
    return this.pedida;
  }

  /** Para el panel: muestra de inmediato la nueva intensidad (y la recuerda en este aparato). */
  usar(opacidad: number): void {
    const v = limpiarOpacidad(opacidad);
    this.opacidadPredicadas.set(v);
    this.guardar(v);
  }

  private async pedir(): Promise<void> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ opacidadPredicadas: number }>(`${environment.apiUrl}/reports/public/apariencia`, {
          headers: { 'ngsw-bypass': 'true' },
        }),
      );
      this.usar(r?.opacidadPredicadas ?? OPACIDAD_PREDICADAS_POR_DEFECTO);
    } catch {
      // Sin señal o servidor sin esta opción: queda la guardada o la de siempre.
    }
  }

  private leerGuardada(): number {
    try {
      const v = globalThis.localStorage?.getItem(CLAVE);
      return v === null || v === undefined ? OPACIDAD_PREDICADAS_POR_DEFECTO : limpiarOpacidad(v);
    } catch {
      return OPACIDAD_PREDICADAS_POR_DEFECTO;
    }
  }

  private guardar(v: number): void {
    try {
      globalThis.localStorage?.setItem(CLAVE, String(v));
    } catch {
      // Almacenamiento bloqueado: solo se pierde recordarla.
    }
  }
}
