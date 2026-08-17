import { Injectable, inject } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import { MapReportService } from '../map-report.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapCaptureService } from './map-capture.service';
import { TOAST_MESSAGES } from '../utils/map-constants';
import { ReportCacheService } from '../../../core/services/report-cache';
import { DraftMarksService } from '../../../core/services/map-draft';
import type { ManzanaMarcada } from '../types/map.types';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapDataPersistenceService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly toastService = inject(Toast);
  private readonly reportService = inject(MapReportService);
  private readonly captureService = inject(MapCaptureService);
  private readonly reportCacheService = inject(ReportCacheService);
  private readonly draftMarksService = inject(DraftMarksService);

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
      const saved = await this.reportService.saveToDatabase(registros);

      const territoriosGuardados = this.state.territoriosSeleccionados();
      this.persistirEnCacheYLimpiarDraft(saved, territoriosGuardados);

      this.selection.reaplicarMarcasSeleccionadas();
      this.toastService.show(TOAST_MESSAGES.saveSuccess);

      const marcadasParaRestaurar = this.state.manzanasMarcadaList();

      this.state.territoriosSeleccionados.set([]);
      this.state.territorioSeleccionado.set(null);
      this.rendering.restaurarVistaConMarcas(marcadasParaRestaurar);
      this.state.totalManzanas.set(0);
      this.state.modoMarcado.set('none');
      this.state.manzanasById.set(new Map());
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

    let guardados: Reporte[] = [];
    let envioConfirmado = false;
    try {
      // Definir qué territorios se envían: un único territorio completado se
      // anuncia con la imagen oficial (sin captura); si hay incompletos, se
      // envían con captura de pantalla.
      const envio = this.reportService.buildTerritoriosParaEnvio(
        marcadas,
        this.rendering.getAllTerritoriesLayer()
      );

      if (envio.territorios.length === 0) {
        this.toastService.show(TOAST_MESSAGES.noSendableTerritories);
        this.state.enviando.set(false);
        return;
      }

      const screenshotBase64 = envio.requiereScreenshot
        ? await this.reportService.captureScreenshot(
            () => this.captureService.prepararCapturaSoloIncompletos(
              marcadas,
              this.state.territoriosSeleccionados(),
              this.rendering.getAllTerritoriesLayer(),
              (num: number) => this.rendering.getManzanaCountByTerritorio(num)
            ),
            () => this.restaurarMapaPostCaptura()
          )
        : null;

      const request = this.reportService.buildWhatsAppRequest(
        perfil,
        envio.territorios,
        screenshotBase64,
        this.state.predicacion()
      );

      // ACID bidireccional:
      // 1) Persistir primero; si el guardado falla, el envío NO se intenta.
      // 2) Enviar solo si el guardado en BD fue exitoso.
      // 3) Si el envío falla, revertir el guardado (compensación) para que no
      //    quede un reporte persistido sin su envío por WhatsApp.
      const registros = this.reportService.buildRegistros(
        this.state.manzanasMarcadaList(),
        this.rendering.getAllTerritoriesLayer(),
        this.state.territoriosSeleccionados(),
        this.state.datosParcialesGuardados
      );
      guardados = await this.reportService.saveToDatabase(registros);

      const success = await this.reportService.sendWhatsApp(request);

      if (!success) {
        await this.revertirGuardado(guardados);
        this.toastService.show(TOAST_MESSAGES.sendRollbackError);
        return;
      }
      envioConfirmado = true;

      const territoriosGuardados = this.state.territoriosSeleccionados();
      this.persistirEnCacheYLimpiarDraft(guardados, territoriosGuardados);

      this.selection.reaplicarMarcasSeleccionadas();

      this.toastService.show(
        TOAST_MESSAGES.sendSuccessTitle,
        4000,
        'sent',
        TOAST_MESSAGES.sendSuccessSubtitle
      );

      this.state.clearDatosParciales();
      this.state.territoriosSeleccionados.set([]);
      this.state.territorioSeleccionado.set(null);
      this.rendering.restaurarVistaConMarcas(this.state.manzanasMarcadaList());
      this.state.totalManzanas.set(0);
      this.state.modoMarcado.set('none');
      this.state.manzanasById.set(new Map());
    } catch {
      if (guardados.length > 0 && !envioConfirmado) {
        // Quedó guardado sin envío confirmado: revertir para cumplir ACID.
        await this.revertirGuardado(guardados);
        this.toastService.show(TOAST_MESSAGES.sendRollbackError);
      } else if (envioConfirmado) {
        // Guardado y enviado OK; falló un paso posterior (restauración).
        this.toastService.show(TOAST_MESSAGES.saveSuccess);
        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.rendering.restaurarVistaConMarcas(this.state.manzanasMarcadaList());
        this.state.totalManzanas.set(0);
        this.state.modoMarcado.set('none');
        this.state.manzanasById.set(new Map());
      } else {
        // El guardado en BD nunca se completó: no se envió nada.
        this.toastService.show(TOAST_MESSAGES.saveError);
      }
    } finally {
      this.state.enviando.set(false);
      this.state.screenshotPreview.set(null);
    }
  }

  private async revertirGuardado(guardados: Reporte[]): Promise<void> {
    await this.reportService.eliminarReportes(guardados);
  }

  private persistirEnCacheYLimpiarDraft(reportes: Reporte[], territorios: number[]): void {
    for (const reporte of reportes) {
      if (reporte.territorioNumero) {
        this.reportCacheService.setTerritorio(reporte.territorioNumero, reporte);
      }
    }
    this.draftMarksService.eliminarTerritorios(territorios);
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
