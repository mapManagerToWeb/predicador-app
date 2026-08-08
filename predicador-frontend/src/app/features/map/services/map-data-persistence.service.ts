import { Injectable, inject } from '@angular/core';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { MapReportService } from '../map-report.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';
import type { ManzanaMarcada } from '../types/map.types';

@Injectable({ providedIn: 'root' })
export class MapDataPersistenceService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);
  private readonly reportService = inject(MapReportService);

  async guardarEnBaseDeDatos(): Promise<void> {
    const perfil = this.reportService.getProfile();
    if (!perfil) {
      this.toastService.show(TOAST_MESSAGES.noProfile);
      return;
    }

    const marcadas = this.state.manzanasMarcadaList();
    if (!marcadas.length) {
      this.toastService.show(TOAST_MESSAGES.noMarked);
      return;
    }

    if (this.state.enviando()) return;
    this.state.enviando.set(true);

    let previousMarcadas: Map<string, ManzanaMarcada> | null = null;
    let previousDatosParciales: typeof this.state.datosParcialesGuardados | null = null;
    try {
      const registros = this.reportService.buildRegistros(
        marcadas,
        this.rendering.getAllTerritoriesLayer(),
        this.state.territoriosSeleccionados(),
        this.state.datosParcialesGuardados
      );

      previousMarcadas = new Map(this.state.manzanasById());
      previousDatosParciales = new Map(this.state.datosParcialesGuardados);
      this.toastService.show(TOAST_MESSAGES.saving);
      this.state.clearDatosParciales();
      await this.reportService.saveToDatabase(registros);

      for (const num of this.state.territoriosSeleccionados()) {
        this.territorioService.invalidateReportCache(num);
        await this.selection.restaurarMarcadoDesdeDB(num, undefined, { actualizarEstadoMarcado: true });
      }

      this.selection.reaplicarMarcasSeleccionadas();
      this.toastService.show(TOAST_MESSAGES.saveSuccess);

      this.state.territoriosSeleccionados.set([]);
      this.state.territorioSeleccionado.set(null);
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadaList(), []);
      this.state.manzanasById.set(new Map());
      this.state.totalManzanas.set(0);
    } catch {
      if (previousMarcadas && previousDatosParciales) {
        this.state.manzanasById.set(previousMarcadas);
        this.state.datosParcialesGuardados = previousDatosParciales;
      }
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

    const marcadas = this.state.manzanasMarcadaList();
    if (!marcadas.length) {
      this.toastService.show(TOAST_MESSAGES.noTerritories);
      return;
    }

    if (this.state.enviando()) return;
    this.state.enviando.set(true);

    let whatsappSent = false;
    try {
      const territorios = this.reportService.buildTerritoriosEnvio(marcadas, this.rendering.getAllTerritoriesLayer());
      // El reporte se envía SIEMPRE con la captura del mapa (aunque todos los
      // territorios estén completos). Si la captura falla, se propaga el error
      // y se bloquea el envío para no mandar una imagen placeholder.
      const screenshotBase64 = await this.reportService.captureScreenshot(
        () => this.prepararCaptura(),
        () => this.restaurarMapaPostCaptura()
      );

      const request = this.reportService.buildWhatsAppRequest(
        perfil,
        territorios,
        screenshotBase64,
        this.state.predicacion()
      );

      const registros = this.reportService.buildRegistros(
        this.state.manzanasMarcadaList(),
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
      whatsappSent = success;

      if (success) {
        const mensajes = territorios.map(t => {
          const estado = t.finalizado ? '*terminado*' : '*incompleto*';
          return `Territorio ${t.numero} ${estado}`;
        });
        this.toastService.show(mensajes.join('\n'));

        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadaList(), []);
        this.state.manzanasById.set(new Map());
        this.state.totalManzanas.set(0);
      } else {
        this.toastService.show(TOAST_MESSAGES.sendError);
      }
    } catch {
      if (!whatsappSent) {
        this.toastService.show(TOAST_MESSAGES.processError);
      } else {
        this.toastService.show(TOAST_MESSAGES.saveSuccess);
        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.state.manzanasById.set(new Map());
        this.state.totalManzanas.set(0);
      }
    } finally {
      this.state.enviando.set(false);
      this.state.screenshotPreview.set(null);
    }
  }

  prepararCaptura(): Promise<void> {
    const marcadas = this.state.manzanasMarcadaList();
    if (marcadas.length === 0) return Promise.resolve();

    return this.rendering.prepararCaptura(marcadas, this.state.territoriosSeleccionados());
  }

  restaurarMapaPostCaptura(): void {
    this.rendering.restaurarMapaPostCaptura(
      this.state.manzanasMarcadaList(),
      this.state.territoriosSeleccionados(),
      this.state.modoMarcado()
    );
  }
}
