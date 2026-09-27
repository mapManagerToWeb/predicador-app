import { TestBed } from '@angular/core/testing';
import { MapCaptureService } from './map-capture.service';

describe('MapCaptureService', () => {
  let service: MapCaptureService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MapCaptureService);
  });

  it('se instancia', () => {
    expect(service).toBeTruthy();
  });

  it('getAllTerritoriesLayer retorna vacío (no-op en modo MapLibre)', () => {
    expect(service.getAllTerritoriesLayer()).toEqual([]);
  });

  it('prepararCaptura resuelve sin hacer nada', async () => {
    await expect(service.prepararCaptura([], [1, 2])).resolves.toBeUndefined();
  });

  it('prepararCapturaSoloIncompletos resuelve sin hacer nada', async () => {
    await expect(
      service.prepararCapturaSoloIncompletos([], [1], [], () => 0),
    ).resolves.toBeUndefined();
  });

  it('restaurarMapaPostCaptura no lanza sin motor', () => {
    expect(() => service.restaurarMapaPostCaptura([], [1], 'ninguno')).not.toThrow();
  });
});
