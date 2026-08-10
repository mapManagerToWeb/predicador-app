import { inject, Injectable } from '@angular/core';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';
import type {
  RegistroReporte,
  WhatsAppSendRequest,
  TerritorioReporteEnvio
} from '../../core/models/models';
import type { ManzanaMarcada, FeatureLayer, DatosParciales } from './types/map.types';

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
   * Construye lista de territorios SOLO incompletos para envío por WhatsApp.
   * Los territorios completados NO se envían.
   */
  buildTerritoriosEnvioSoloIncompletos(
    marcadas: ManzanaMarcada[],
    allTerritoriesLayer: FeatureLayer[]
  ): TerritorioReporteEnvio[] {
    const porTerritorio = this.groupByTerritorio(marcadas);

    const territorios: TerritorioReporteEnvio[] = [];
    for (const [territorioNum, marcadasTerritorio] of porTerritorio) {
      const featureLayer = allTerritoriesLayer.find(f => f.territorioPadre === territorioNum);
      const total = this.countTotalManzanas(featureLayer, marcadasTerritorio.length);

      const nonPartial = marcadasTerritorio.filter(m => !m.id.startsWith('parcial-'));
      const finalizado = nonPartial.length >= total && total > 0;

      // Solo incluir territorios INCOMPLETOS
      if (!finalizado) {
        territorios.push({
          numero: territorioNum,
          finalizado: false,
          totalManzanas: total,
          manzanasMarcadas: marcadasTerritorio.length
        });
      }
    }

    return territorios;
  }

  async captureScreenshot(
    prepararCaptura: () => Promise<void>,
    restaurarMapaPostCaptura: () => void
  ): Promise<string | null> {
    try {
      await prepararCaptura();
      const mapElement = typeof document === 'undefined' ? null : document.getElementById('map');
      if (!mapElement) return null;

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        scale: 1,
        backgroundColor: null,
        logging: false
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
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

  async saveToDatabase(registros: RegistroReporte[]): Promise<void> {
    await this.territorioService.crearReportes(registros);
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

  async sendWhatsApp(request: WhatsAppSendRequest): Promise<boolean> {
    const response = await this.whatsappService.sendReport(request);
    return response.success;
  }

  getProfile() {
    return this.profileService.currentUser();
  }
}
