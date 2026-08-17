import { TestBed } from '@angular/core/testing';
import { MapReportService } from './map-report.service';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';
import type { ManzanaMarcada, FeatureLayer, DatosParciales } from './types/map.types';
import { makeLatLng } from './map-geometry';
import type { UserProfile } from '../../core/models/models';

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn().mockRejectedValue(new Error('capture failed')),
}));

vi.mock('./utils/ios-detection', () => ({
  isIOS: vi.fn().mockReturnValue(false),
}));

describe('MapReportService', () => {
  let service: MapReportService;
  let restoreMap: ReturnType<typeof vi.fn>;
  let profile: UserProfile | null;

  beforeEach(async () => {
    restoreMap = vi.fn();
    profile = { name: 'Daniel', lastName: 'Uribe', avatar: 3, telefono: '56912345678', encargadoId: 7 };
    const toJpeg = (await import('html-to-image')).toJpeg as ReturnType<typeof vi.fn>;
    toJpeg.mockClear();
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

    it('returns the base64 body of the captured element (JPEG)', async () => {
      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      document.body.appendChild(mapElement);
      const toJpeg = (await import('html-to-image')).toJpeg as ReturnType<typeof vi.fn>;
      toJpeg.mockResolvedValue('data:image/jpeg;base64,ABC123');

      await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).resolves.toBe('ABC123');

      expect(toJpeg).toHaveBeenCalledWith(mapElement, expect.objectContaining({ pixelRatio: expect.any(Number) }));
      expect(restoreMap).toHaveBeenCalledOnce();
      mapElement.remove();
    });

    it('warm-up capture on Safari returns the largest dataUrl (iOS blank-first-capture bug)', async () => {
      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      document.body.appendChild(mapElement);
      const uaSpy = vi
        .spyOn(window.navigator, 'userAgent', 'get')
        .mockReturnValue(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        );
      const toJpeg = (await import('html-to-image')).toJpeg as ReturnType<typeof vi.fn>;
      toJpeg
        .mockResolvedValueOnce('data:image/jpeg;base64,' + 'AA'.repeat(24))
        .mockResolvedValueOnce('data:image/jpeg;base64,' + 'BB'.repeat(96));

      await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).resolves.toBe(
        'BB'.repeat(96),
      );

      expect(toJpeg).toHaveBeenCalledTimes(2);
      uaSpy.mockRestore();
      mapElement.remove();
    });

    it('single capture outside Safari (Chrome/Windows)', async () => {
      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      document.body.appendChild(mapElement);
      const uaSpy = vi
        .spyOn(window.navigator, 'userAgent', 'get')
        .mockReturnValue(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        );
      const toJpeg = (await import('html-to-image')).toJpeg as ReturnType<typeof vi.fn>;
      toJpeg.mockResolvedValue('data:image/jpeg;base64,ABC123');

      await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).resolves.toBe('ABC123');

      expect(toJpeg).toHaveBeenCalledTimes(1);
      uaSpy.mockRestore();
      mapElement.remove();
    });

    it('uses captureMapComposite on iOS instead of html-to-image', async () => {
      const { isIOS } = await import('./utils/ios-detection');
      (isIOS as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      Object.defineProperty(mapElement, 'clientWidth', { value: 800 });
      Object.defineProperty(mapElement, 'clientHeight', { value: 600 });
      document.body.appendChild(mapElement);

      vi.spyOn(mapElement, 'querySelectorAll').mockReturnValue([] as any);

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          const mockCanvas = origCreate('canvas');
          mockCanvas.width = 1600;
          mockCanvas.height = 1200;
          vi.spyOn(mockCanvas, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
            scale: vi.fn(),
          } as any);
          vi.spyOn(mockCanvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,iosresult');
          return mockCanvas;
        }
        return origCreate(tag);
      });

      const toJpeg = (await import('html-to-image')).toJpeg as ReturnType<typeof vi.fn>;
      toJpeg.mockClear();

      const result = await service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap);

      expect(result).toBe('iosresult');
      expect(toJpeg).not.toHaveBeenCalled();
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

  describe('buildTerritoriosParaEnvio', () => {
    it('envía un único territorio completo con la imagen predeterminada (sin screenshot)', () => {
      const marcadas = [makeMarcada('m1', 1)];
      const envio = service.buildTerritoriosParaEnvio(marcadas, [makeTerritoryLayer(1, 1)]);

      expect(envio.territorios).toEqual([{ numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 }]);
      expect(envio.requiereScreenshot).toBe(false);
    });

    it('requiere captura para un único territorio incompleto', () => {
      const marcadas = [makeMarcada('parcial-1', 1)];
      const envio = service.buildTerritoriosParaEnvio(marcadas, [makeTerritoryLayer(1, 4)]);

      expect(envio.territorios).toEqual([{ numero: 1, finalizado: false, totalManzanas: 4, manzanasMarcadas: 1 }]);
      expect(envio.requiereScreenshot).toBe(true);
    });

    it('excluye los territorios completados cuando hay más de uno marcado', () => {
      const marcadas = [makeMarcada('m1', 1), makeMarcada('m2', 2)];
      const envio = service.buildTerritoriosParaEnvio(
        marcadas,
        [makeTerritoryLayer(1, 1), makeTerritoryLayer(2, 4)],
      );

      expect(envio.territorios).toEqual([{ numero: 2, finalizado: false, totalManzanas: 4, manzanasMarcadas: 1 }]);
      expect(envio.requiereScreenshot).toBe(true);
    });

    it('no deja territorios cuando todos los marcados están completos y son varios', () => {
      const marcadas = [makeMarcada('m1', 1), makeMarcada('m2', 2)];
      const envio = service.buildTerritoriosParaEnvio(
        marcadas,
        [makeTerritoryLayer(1, 1), makeTerritoryLayer(2, 1)],
      );

      expect(envio.territorios).toEqual([]);
      expect(envio.requiereScreenshot).toBe(false);
    });
  });

  describe('buildWhatsAppRequest', () => {
    it('builds the request with a formatted date and territory summary', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-21T12:00:00'));

      const territorios = [{ numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 }];
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

  describe('captureMapComposite', () => {
    it('returns a data URL string from canvas composition', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 800;
      mockCanvas.height = 600;
      vi.spyOn(mockCanvas, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        scale: vi.fn(),
      } as any);
      vi.spyOn(mockCanvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,fake');

      const mapElement = document.createElement('div');
      Object.defineProperty(mapElement, 'clientWidth', { value: 800 });
      Object.defineProperty(mapElement, 'clientHeight', { value: 600 });

      const tile1 = document.createElement('img');
      tile1.style.position = 'absolute';
      tile1.style.left = '0px';
      tile1.style.top = '0px';
      tile1.style.width = '256px';
      tile1.style.height = '256px';

      const tile2 = document.createElement('img');
      tile2.style.position = 'absolute';
      tile2.style.left = '256px';
      tile2.style.top = '0px';
      tile2.style.width = '256px';
      tile2.style.height = '256px';

      vi.spyOn(mapElement, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, toJSON() {},
      });
      Object.defineProperty(tile1, 'complete', { value: true });
      Object.defineProperty(tile1, 'naturalWidth', { value: 256 });
      Object.defineProperty(tile2, 'complete', { value: true });
      Object.defineProperty(tile2, 'naturalWidth', { value: 256 });
      vi.spyOn(tile1, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, width: 256, height: 256, top: 0, left: 0, right: 256, bottom: 256, toJSON() {},
      });
      vi.spyOn(tile2, 'getBoundingClientRect').mockReturnValue({
        x: 256, y: 0, width: 256, height: 256, top: 0, left: 256, right: 512, bottom: 256, toJSON() {},
      });

      vi.spyOn(mapElement, 'querySelectorAll').mockImplementation((selector: string) => {
        if (selector === '.leaflet-tile-pane img') return [tile1, tile2] as any;
        if (selector === '.leaflet-canvas-pane canvas') return [mockCanvas] as any;
        return [] as any;
      });

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') return mockCanvas;
        return origCreate(tag);
      });

      const result = (service as any).captureMapComposite(mapElement);
      expect(result).toBe('fake');
    });
  });

  describe('persistencia y compensación', () => {
    let territorioService: {
      crearReportes: ReturnType<typeof vi.fn>;
      eliminarReportes: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      territorioService = {
        crearReportes: vi.fn().mockResolvedValue([]),
        eliminarReportes: vi.fn().mockResolvedValue(undefined),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          MapReportService,
          { provide: TerritorioService, useValue: territorioService },
          { provide: Profile, useValue: { currentUser: () => profile } },
          { provide: Toast, useValue: {} },
          { provide: WhatsAppService, useValue: {} },
        ],
      });
      service = TestBed.inject(MapReportService);
    });

    it('delegates persistence to TerritorioService', async () => {
      territorioService.crearReportes.mockResolvedValue([{ id: 1 }]);

      const result = await service.saveToDatabase([]);

      expect(territorioService.crearReportes).toHaveBeenCalledWith([]);
      expect(result).toEqual([{ id: 1 }]);
    });

    it('eliminarReportes only deletes newly saved reports', async () => {
      await service.eliminarReportes([
        { id: 10 },
        { id: -1, fechaRegistro: 'x' },
        {},
      ] as never[]);

      expect(territorioService.eliminarReportes).toHaveBeenCalledWith([10]);
    });

    it('eliminarReportes forwards an empty list to TerritorioService (guarded there)', async () => {
      await service.eliminarReportes([]);

      expect(territorioService.eliminarReportes).toHaveBeenCalledWith([]);
    });
  });
});
