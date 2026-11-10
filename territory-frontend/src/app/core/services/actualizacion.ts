import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';

/** Mientras la app está abierta, cada cuánto se pregunta si hay versión nueva. */
const REVISAR_CADA_MS = 30 * 60_000;
/** No preguntar más de una vez por minuto (al entrar y salir seguido de la app). */
const ENTRE_REVISIONES_MS = 60_000;
/** Si estuvo cerrada (en segundo plano) al menos esto, al volver cuenta como recién abierta. */
const AUSENCIA_MS = 60_000;
/** Nunca recargar sola dos veces seguidas (por si la versión nueva no llegara a activarse). */
const ENTRE_RECARGAS_MS = 5 * 60_000;
const CLAVE_RECARGA = 'app-recarga-por-version';

/**
 * Que los hermanos vean siempre la última versión sin borrar los datos del
 * teléfono.
 *
 * La app queda guardada en el teléfono (service worker) para abrir rápido y
 * sin señal. Al publicar una versión nueva, el teléfono la descarga por detrás,
 * pero la app abierta sigue con la vieja; y como en el celular la app casi
 * nunca se cierra del todo (queda en segundo plano), la vieja podía durar
 * días. Ahora:
 * - se pregunta por versiones nuevas al abrir, al volver a la app y cada 30 min;
 * - si hay una lista y el hermano todavía no tocó nada (recién abrió o volvió
 *   después de un rato), se recarga sola;
 * - si ya estaba usando la app, aparece un aviso con «Actualizar», para no
 *   cortarle algo a medias (lo marcado sin enviar se guarda solo y sobrevive).
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionApp {
  private readonly sw = inject(SwUpdate);
  private readonly doc = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Hay una versión nueva descargada esperando: se muestra el aviso. */
  readonly hayVersionNueva = signal(false);

  private iniciada = false;
  private interactuo = false;
  private ultimaRevision = 0;
  private ocultaDesde: number | null = null;

  iniciar(): void {
    if (this.iniciada || !this.navegador || !this.sw.isEnabled) return;
    this.iniciada = true;
    const ventana = this.doc.defaultView;
    this.sw.versionUpdates.subscribe(e => this.alEvento(e));
    // La copia guardada quedó rota (el teléfono borró parte): solo sirve recargar.
    this.sw.unrecoverable.subscribe(() => this.recargar());
    const marcar = (): void => {
      this.interactuo = true;
    };
    ventana?.addEventListener('pointerdown', marcar, { capture: true, passive: true });
    ventana?.addEventListener('keydown', marcar, { capture: true });
    this.doc.addEventListener('visibilitychange', () => this.alCambiarVisibilidad());
    ventana?.setInterval(() => {
      if (this.doc.visibilityState === 'visible') void this.revisar();
    }, REVISAR_CADA_MS);
    void this.revisar();
  }

  /** Botón «Actualizar» del aviso. */
  async actualizar(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } catch {
      // Si no se pudo activar, la recarga igual toma la versión nueva al abrir.
    }
    this.recargar();
  }

  private alEvento(e: VersionEvent): void {
    if (e.type !== 'VERSION_READY') return;
    this.hayVersionNueva.set(true);
    if (!this.interactuo) this.actualizarSola();
  }

  private alCambiarVisibilidad(): void {
    if (this.doc.visibilityState === 'hidden') {
      this.ocultaDesde = Date.now();
      return;
    }
    const fuera = this.ocultaDesde === null ? 0 : Date.now() - this.ocultaDesde;
    this.ocultaDesde = null;
    if (fuera >= AUSENCIA_MS) {
      // Volver después de un rato es como abrirla de nuevo.
      this.interactuo = false;
      if (this.hayVersionNueva()) {
        this.actualizarSola();
        return;
      }
    }
    void this.revisar();
  }

  private actualizarSola(): void {
    const almacen = this.almacen();
    try {
      const ultima = Number(almacen?.getItem(CLAVE_RECARGA) ?? 0);
      if (Date.now() - ultima < ENTRE_RECARGAS_MS) return;
      almacen?.setItem(CLAVE_RECARGA, String(Date.now()));
    } catch {
      // Sin almacenamiento (modo privado): se recarga igual.
    }
    void this.actualizar();
  }

  private async revisar(): Promise<void> {
    const ahora = Date.now();
    if (ahora - this.ultimaRevision < ENTRE_REVISIONES_MS) return;
    this.ultimaRevision = ahora;
    try {
      await this.sw.checkForUpdate();
    } catch {
      // Sin señal o el service worker aún no se registra: se vuelve a intentar después.
    }
  }

  private almacen(): Storage | null {
    try {
      return this.doc.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  /** Aparte para poder probarlo sin recargar la página de los tests. */
  protected recargar(): void {
    this.doc.location.reload();
  }
}
