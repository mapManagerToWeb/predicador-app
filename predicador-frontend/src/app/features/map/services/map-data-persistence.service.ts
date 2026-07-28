import { Injectable, inject } from '@angular/core';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { MapReportService } from '../map-report.service';
import { MapRenderingService } from './map-rendering.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';

@Injectable({ providedIn: 'root' })
export class MapDataPersistenceService {
  private state = inject(MapStateService);
  private rendering = inject(MapRenderingService);
  private selection = inject(MapSelectionService);
  private territorioService = inject(TerritorioService);
  private toastService = inject(Toast);
  private reportService = inject(MapReportService);

  async guardarEnBaseDeDatos(): Promise<void> {
    const perfil = this.reportService.getProfile();
    if (!perfil) {
      this.toastService.show(TOAST_MESSAGES.noProfile);
      return;
    }

    const marcadas = this.state.manzanasMarcadas();
    if (!marcadas.length) {
      this.toastService.show(TOAST_MESSAGES.noMarked);
      return;
    }

    if (this.state.enviando()) return;
    this.state.enviando.set(true);

    const registros = this.reportService.buildRegistros(
      marcadas,
      this.rendering.getAllTerritoriesLayer(),
      this.state.territoriosSeleccionados(),
      this.state.datosParcialesGuardados
    );

    const previousMarcadas = [...marcadas];
    const previousDatosParciales = new Map(this.state.datosParcialesGuardados);

    this.toastService.show(TOAST_MESSAGES.saving);
    this.state.clearDatosParciales();

    try {
      await this.reportService.saveToDatabase(registros);

      for (const num of this.state.territoriosSeleccionados()) {
        this.territorioService.invalidateReportCache(num);
        await this.selection.restaurarMarcadoDesdeDB(num, undefined, { actualizarEstadoMarcado: true });
      }

      this.selection.reaplicarMarcasSeleccionadas();
      this.toastService.show(TOAST_MESSAGES.saveSuccess);
      
      this.state.territoriosSeleccionados.set([]);
      this.state.territorioSeleccionado.set(null);
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), []);
      this.state.manzanasMarcadas.set([]);
      this.state.totalManzanas.set(0);
    } catch {
      this.state.manzanasMarcadas.set(previousMarcadas);
      this.state.datosParcialesGuardados = previousDatosParciales;
      this.toastService.show(TOAST_MESSAGES.saveError);
    } finally {
      this.state.enviando.set(false);
    }
  }

  async guardarYEnviar(): Promise<void> {
    const perfil = this.reportService.getProfile();
    if (!perfil) {
      this.toastService.show(TOAST_MESSAGES.noProfile);
      return;
    }

    const marcadas = this.state.manzanasMarcadas();
    if (!marcadas.length) {
      this.toastService.show(TOAST_MESSAGES.noTerritories);
      return;
    }

    if (this.state.enviando()) return;
    this.state.enviando.set(true);

    const territorios = this.reportService.buildTerritoriosEnvio(marcadas, this.rendering.getAllTerritoriesLayer());
    const requiereScreenshot = territorios.some(t => !t.finalizado);

    let screenshotBase64: string | null = null;
    if (requiereScreenshot) {
      screenshotBase64 = await this.reportService.captureScreenshot(
        () => this.prepararCaptura(),
        () => this.restaurarMapaPostCaptura()
      );
    }

    const request = this.reportService.buildWhatsAppRequest(
      perfil,
      territorios,
      screenshotBase64,
      this.state.predicacion()
    );

    try {
      const registros = this.reportService.buildRegistros(
        this.state.manzanasMarcadas(),
        this.rendering.getAllTerritoriesLayer(),
        this.state.territoriosSeleccionados(),
        this.state.datosParcialesGuardados
      );
      await this.reportService.saveToDatabase(registros);

      for (const num of this.state.territoriosSeleccionados()) {
        this.territorioService.invalidateReportCache(num);
        await this.selection.restaurarMarcadoDesdeDB(num, undefined, { actualizarEstadoMarcado: true });
      }

      this.selection.reaplicarMarcasSeleccionadas();

      const success = await this.reportService.sendWhatsApp(request);

      if (success) {
        const mensajes = territorios.map(t => {
          const estado = t.finalizado ? '*terminado*' : '*faltante*';
          return `Territorio ${t.numero} ${estado}`;
        });
        this.toastService.show(mensajes.join('\n'));

        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), []);
        this.state.manzanasMarcadas.set([]);
        this.state.totalManzanas.set(0);
      } else {
        this.toastService.show(TOAST_MESSAGES.sendError);
      }
    } catch {
      this.toastService.show(TOAST_MESSAGES.processError);
    } finally {
      this.state.enviando.set(false);
      this.state.screenshotPreview.set(null);
    }
  }

  prepararCaptura(): Promise<void> {
    const marcadas = this.state.manzanasMarcadas();
    if (marcadas.length === 0) return Promise.resolve();

    return this.rendering.prepararCaptura(marcadas, this.state.territoriosSeleccionados());
  }

  restaurarMapaPostCaptura(): void {
    this.rendering.restaurarMapaPostCaptura(
      this.state.manzanasMarcadas(),
      this.state.territoriosSeleccionados(),
      this.state.modoMarcado()
    );
  }
}
