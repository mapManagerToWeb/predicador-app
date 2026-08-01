import { TestBed } from '@angular/core/testing';
import { MapReportService } from './map-report.service';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';
import type { ManzanaMarcada, FeatureLayer, DatosParciales } from './types/map.types';
import { makeLatLng } from './map-geometry';
import type { UserProfile } from '../../core/models/models';

vi.mock('html2canvas', () => ({
  default: vi.fn().mockRejectedValue(new Error('capture failed')),
}));

describe('MapReportService', () => {
  let service: MapReportService;
  let restoreMap: ReturnType<typeof vi.fn>;
  let profile: UserProfile | null;

  beforeEach(() => {
    restoreMap = vi.fn();
    profile = { name: 'Daniel', lastName: 'Uribe', avatar: 3, telefono: '56912345678', encargadoId: 7 };
    TestBed.configureTestingModule({
      providers: [
        MapReportService,
        { provide: TerritorioService, useValue: {} },
        { provide: Profile, useValue: { currentUser: () => profile } },
        { provide: Toast, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
      ],
    });
    service = TestBed.inject(MapReportService);
  });

  describe('captureScreenshot', () => {
    it('restores map state when no map element exists after preparation', async () => {
      const prepareMap = vi.fn().mockResolvedValue(undefined);

      await expect(service.captureScreenshot(prepareMap, restoreMap)).resolves.toBeNull();

      expect(prepareMap).toHaveBeenCalledOnce();
      expect(restoreMap).toHaveBeenCalledOnce();
    });

    it('restores map state when capture preparation fails', async () => {
      const prepareMap = vi.fn().mockRejectedValue(new Error('prepare failed'));

      await expect(service.captureScreenshot(prepareMap, restoreMap)).rejects.toThrow('prepare failed');

      expect(restoreMap).toHaveBeenCalledOnce();
    });

    it('restores map state when screenshot rendering fails', async () => {
      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      document.body.appendChild(mapElement);

      await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).rejects.toThrow(
        'capture failed',
      );

      expect(restoreMap).toHaveBeenCalledOnce();
      mapElement.remove();
    });
  });

  function makeMarcada(id: string, territorioNumero: number): ManzanaMarcada {
    return { id, nombreBloque: 'A-1', layer: {} as never, territorioNumero };
  }

  function makeTerritoryLayer(numero: number, layerCount: number): FeatureLayer {
    const layers = Array.from({ length: layerCount }, () => ({ setStyle: () => undefined }));
    return { territorioPadre: numero, color: '#fff', layer: { getLayers: () => layers } as never };
  }

  describe('buildRegistros', () => {
    it('builds one registro per selected territory', () => {
      const marcadas = [makeMarcada('m1', 1), makeMarcada('parcial-1', 1)];
      const registros = service.buildRegistros(marcadas, [makeTerritoryLayer(1, 2)], [1], new Map());

      expect(registros).toHaveLength(1);
      expect(registros[0].territorioNumero).toBe(1);
      expect(registros[0].manzanasMarcadas).toBe(2);
      expect(registros[0].totalManzanas).toBe(2);
      expect(registros[0].estado).toBe('completed');
      expect(registros[0].tipoSesion).toBe('completa');
      expect(registros[0].encargadoId).toBe(7);
      expect(registros[0].manzanaId).toBe('m1');
      expect(registros[0].manzanasIds).toBe('m1');
    });

    it('ignores territories that were not selected', () => {
      const marcadas = [makeMarcada('m1', 1), makeMarcada('m2', 2)];
      const registros = service.buildRegistros(marcadas, [], [2], new Map());

      expect(registros).toHaveLength(1);
      expect(registros[0].territorioNumero).toBe(2);
    });

    it('marks a territory as incomplete when fewer manzanas than total are marked', () => {
      const marcadas = [makeMarcada('m1', 1)];
      const registros = service.buildRegistros(marcadas, [makeTerritoryLayer(1, 5)], [1], new Map());

      expect(registros[0].estado).toBe('incomplete');
      expect(registros[0].tipoSesion).toBe('parcial');
    });

    it('includes partial geometry for territories with partial data', () => {
      const marcadas = [makeMarcada('parcial-1', 1)];
      const parciales = new Map<number, DatosParciales>([
        [1, { geometria: '{"type":"Polygon"}', puntos: [{ latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 }] }],
      ]);

      const registros = service.buildRegistros(marcadas, [], [1], parciales);

      expect(registros[0].geometriaParcial).toBe('{"type":"Polygon"}');
      expect(registros[0].puntosParciales).toBe('[{"lat":0,"lng":0}]');
      expect(registros[0].manzanaId).toBeNull();
    });

    it('returns an empty list when there is no profile', () => {
      profile = null;
      expect(service.buildRegistros([makeMarcada('m1', 1)], [], [1], new Map())).toEqual([]);
    });
  });

  describe('buildTerritoriosEnvio', () => {
    it('marks territories as finished only when all manzanas are marked', () => {
      const marcadas = [makeMarcada('m1', 1)];
      const territorios = service.buildTerritoriosEnvio(marcadas, [makeTerritoryLayer(1, 1)]);

      expect(territorios).toEqual([{ numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 }]);
    });

    it('marks territories as unfinished when coverage is partial', () => {
      const marcadas = [makeMarcada('parcial-1', 1)];
      const territorios = service.buildTerritoriosEnvio(marcadas, [makeTerritoryLayer(1, 4)]);

      expect(territorios[0].finalizado).toBe(false);
    });
  });

  describe('buildWhatsAppRequest', () => {
    it('builds the request with a formatted date and territory summary', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-21T12:00:00'));

      const territorios = service.buildTerritoriosEnvio([makeMarcada('m1', 1)], [makeTerritoryLayer(1, 1)]);
      const request = service.buildWhatsAppRequest(profile, territorios, null, 'tarde');

      expect(request).toEqual({
        encargadoNombre: 'Daniel',
        encargadoApellido: 'Uribe',
        fechaRegistro: '21-07-2026',
        predicacion: 'tarde',
        territorios,
        screenshotBase64: null,
        destinationNumber: '56912345678',
      });

      vi.useRealTimers();
    });
  });

  describe('getProfile', () => {
    it('returns the current profile', () => {
      expect(service.getProfile()).toEqual(profile);
    });
  });
});
