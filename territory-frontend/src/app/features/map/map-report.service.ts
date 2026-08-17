import { inject, Injectable } from '@angular/core';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';
import type {
  RegistroReporte,
  Reporte,
  WhatsAppSendRequest,
  TerritorioReporteEnvio,
  TerritoriosEnvio
} from '../../core/models/models';
import type { ManzanaMarcada, FeatureLayer, DatosParciales } from './types/map.types';

const SCREENSHOT_RETRIES = 2;

@Injectable({ providedIn: 'root' })
export class MapReportService {
  private territorioService = inject(TerritorioService);
  private profileService = inject(Profile);
  private toastService = inject(Toast);
  private whatsappService = inject(WhatsAppService);

  buildRegistros(
    marcadas: ManzanaMarcada[],
    allTerritoriesLayer: FeatureLayer[],
    territoriosSeleccionados: number[],
    datosParcialesPorTerritorio: Map<number, DatosParciales>
  ): RegistroReporte[] {
    const perfil = this.profileService.currentUser();
    if (!perfil) return [];

    const seleccionados = new Set(territoriosSeleccionados);
    const porTerritorio = this.groupByTerritorio(marcadas, seleccionados);

    const registros: RegistroReporte[] = [];
    for (const [territorioNum, marcadasTerritorio] of porTerritorio) {
      const featureLayer = allTerritoriesLayer.find(f => f.territorioPadre === territorioNum);
      const total = this.countTotalManzanas(featureLayer, marcadasTerritorio.length);

      const nonPartial = marcadasTerritorio.filter(m => !m.id.startsWith('parcial-'));
      const manzanaId = nonPartial.length > 0 ? nonPartial[0].id : null;
      const manzanasIds = nonPartial.map(m => m.id).join(',');

      // Buscar los datos parciales ESPECÍFICOS del territorio (no compartidos entre todos).
      const parcialTerritorio = datosParcialesPorTerritorio.get(territorioNum);
      let geometriaParcial: string | null = null;
      let puntosParciales: string | null = null;
      if (parcialTerritorio) {
        geometriaParcial = parcialTerritorio.geometria;
        puntosParciales = JSON.stringify(
          parcialTerritorio.puntos.map(p => ({ lat: p.latlng.lat, lng: p.latlng.lng }))
        );
      }

      registros.push({
        territorioNumero: territorioNum,
        manzanaId,
        encargadoId: perfil.encargadoId || null,
        encargadoNombre: perfil.name,
        encargadoApellido: perfil.lastName,
        sessionTime: new Date().toISOString(),
        estado: total > 0 && marcadasTerritorio.length >= total ? 'completed' : 'incomplete',
        totalManzanas: total,
        manzanasMarcadas: marcadasTerritorio.length,
        tipoSesion: total > 0 && marcadasTerritorio.length >= total ? 'completa' : 'parcial',
        geometriaParcial,
        puntosParciales,
        manzanasIds
      });
    }

    return registros;
  }

  /**
   * Construye la lista de territorios a enviar por WhatsApp y si el envío
   * requiere captura de pantalla.
   *
   * - Un único territorio marcado y completo: se envía con la imagen
   *   predeterminada (sin captura), anunciando el cierre del territorio.
   * - Si hay territorios incompletos: se envían esos con captura de pantalla;
   *   los territorios completados se excluyen del mensaje.
   */
  buildTerritoriosParaEnvio(
    marcadas: ManzanaMarcada[],
    allTerritoriesLayer: FeatureLayer[]
  ): TerritoriosEnvio {
    const porTerritorio = this.groupByTerritorio(marcadas);
    const esUnicoTerritorio = porTerritorio.size === 1;

    const territorios: TerritorioReporteEnvio[] = [];
    for (const [territorioNum, marcadasTerritorio] of porTerritorio) {
      const featureLayer = allTerritoriesLayer.find(f => f.territorioPadre === territorioNum);
      const total = this.countTotalManzanas(featureLayer, marcadasTerritorio.length);

      const nonPartial = marcadasTerritorio.filter(m => !m.id.startsWith('parcial-'));
      const finalizado = nonPartial.length >= total && total > 0;

      if (esUnicoTerritorio || !finalizado) {
        territorios.push({
          numero: territorioNum,
          finalizado,
          totalManzanas: total,
          manzanasMarcadas: marcadasTerritorio.length
        });
      }
    }

    const soloTerritorioCompleto =
      esUnicoTerritorio && territorios.length === 1 && territorios[0].finalizado;
    return { territorios, requiereScreenshot: territorios.length > 0 && !soloTerritorioCompleto };
  }

  async captureScreenshot(
    prepararCaptura: () => Promise<void>,
    restaurarMapaPostCaptura: () => void
  ): Promise<string | null> {
    try {
      await prepararCaptura();
      const mapElement = typeof document === 'undefined' ? null : document.getElementById('map');
      if (!mapElement) return null;

      const { toJpeg } = await import('html-to-image');
      // JPEG (no PNG): coincide con el content-type image/jpeg que el backend
      // usa al subir a WhatsApp y mantiene el payload dentro de los límites del
      // gateway (10MB) incluso con pantallas grandes.
      const dataUrl = await this.renderScreenshot(mapElement, toJpeg, {
        quality: 0.85,
        pixelRatio: 2,
        cacheBust: true,
      });
      return dataUrl.split(',')[1];
    } finally {
      try {
        restaurarMapaPostCaptura();
      } catch {
        // Cleanup must not replace the original capture or preparation error.
      }
    }
  }

  buildWhatsAppRequest(
    perfil: { name: string; lastName: string; telefono?: string; encargadoId?: number },
    territorios: TerritorioReporteEnvio[],
    screenshotBase64: string | null,
    predicacion: string
  ): WhatsAppSendRequest {
    const now = new Date();
    const fechaRegistro =
      `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;

    return {
      encargadoNombre: perfil.name,
      encargadoApellido: perfil.lastName,
      fechaRegistro,
      predicacion,
      territorios,
      screenshotBase64,
      destinationNumber: perfil.telefono || null
    };
  }

  async saveToDatabase(registros: RegistroReporte[]): Promise<Reporte[]> {
    return this.territorioService.crearReportes(registros);
  }

  /**
   * Compensación ACID: revierte reportes recién guardados si el envío por
   * WhatsApp no se confirma, para que no quede un reporte sin enviar.
   */
  async eliminarReportes(reportes: Reporte[]): Promise<void> {
    const ids = reportes.map(r => r.id).filter(id => id > 0);
    await this.territorioService.eliminarReportes(ids);
  }

  private groupByTerritorio(marcadas: ManzanaMarcada[], seleccionados?: Set<number>): Map<number, ManzanaMarcada[]> {
    const porTerritorio = new Map<number, ManzanaMarcada[]>();
    for (const m of marcadas) {
      if (seleccionados && !seleccionados.has(m.territorioNumero)) continue;
      const list = porTerritorio.get(m.territorioNumero) ?? [];
      list.push(m);
      porTerritorio.set(m.territorioNumero, list);
    }
    return porTerritorio;
  }

  private countTotalManzanas(featureLayer: FeatureLayer | undefined, fallback: number): number {
    if (!featureLayer) return fallback;
    return Array.from(featureLayer.layer.getLayers()).filter(l => 'setStyle' in l).length;
  }

  /**
   * Captures the map element, keeping the largest result.
   *
   * <p>iOS Safari/WebKit has a known html-to-image bug: the SVG foreignObject
   * decodes tile images in a separate context, so the FIRST capture after a
   * DOM mutation (the capture refit/styles) can render with blank or missing
   * tiles. Retrying once and keeping the largest dataUrl yields a complete
   * screenshot <!-- see bubkoo/html-to-image#461 -->. UA-gated so Chrome,
   * Firefox, Android and Windows/macOS browsers keep a single capture.
   */
  private async renderScreenshot(
    mapElement: HTMLElement,
    toJpeg: (node: HTMLElement, options: object) => Promise<string>,
    options: object
  ): Promise<string> {
    const attempts = this.isSafari() ? SCREENSHOT_RETRIES : 1;
    let best = '';
    for (let attempt = 0; attempt < attempts; attempt++) {
      const dataUrl = await toJpeg(mapElement, options);
      // JPEG output size correlates with content richness: a blank/partial
      // render compresses smaller than the complete one, so keep the largest.
      if (dataUrl.length > best.length) {
        best = dataUrl;
      }
    }
    return best;
  }

  /** True for Safari (including iOS), excluding Chromium/Firefox impostors. */
  private isSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /AppleWebKit/.test(ua) && !/(Chrome|CriOS|Edg|OPR|Firefox|SamsungBrowser)/.test(ua);
  }

  /**
   * Manually composes the map screenshot by drawing tiles and the Leaflet
   * Canvas onto a temporary Canvas element.
   *
   * Used on iOS where html-to-image cannot capture the Leaflet Canvas
   * (SVG foreignObject limitation in WebKit).
   */
  private captureMapComposite(mapElement: HTMLElement): string | null {
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;
    if (width === 0 || height === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(2, 2);

    const tiles = Array.from(
      mapElement.querySelectorAll('.leaflet-tile-pane img')
    ) as HTMLImageElement[];

    for (const tile of tiles) {
      if (!tile.complete || tile.naturalWidth === 0) continue;
      const rect = tile.getBoundingClientRect();
      const mapRect = mapElement.getBoundingClientRect();
      const x = rect.left - mapRect.left;
      const y = rect.top - mapRect.top;
      try {
        ctx.drawImage(tile, x, y, rect.width, rect.height);
      } catch {
        // CORS or tainted canvas — skip this tile
      }
    }

    const leafletCanvas = mapElement.querySelector(
      '.leaflet-canvas-pane canvas'
    ) as HTMLCanvasElement | null;

    if (leafletCanvas) {
      try {
        ctx.drawImage(leafletCanvas, 0, 0, width, height);
      } catch {
        // Canvas tainted — skip overlay
      }
    }

    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  async sendWhatsApp(request: WhatsAppSendRequest): Promise<boolean> {
    const response = await this.whatsappService.sendReport(request);
    return response.success;
  }

  getProfile() {
    return this.profileService.currentUser();
  }
}
