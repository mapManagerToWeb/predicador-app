import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapPartialDrawService } from './map-partial-draw.service';

/**
 * MapPartialDrawService is a retained no-op shim: in MapLibre-only mode
 * partial drawing is rendered by MapEditOverlayService. These tests pin
 * the contract the (former) facade wiring relies on — every legacy call
 * is accepted and does nothing observable.
 */
describe('MapPartialDrawService (no-op shim)', () => {
  let service: MapPartialDrawService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapPartialDrawService],
    });
    service = TestBed.inject(MapPartialDrawService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('getPoligonoParcial always returns null (rendering lives in the edit overlay)', () => {
    expect(service.getPoligonoParcial()).toBeNull();
  });

  it('accepts and discards a projection adapter', () => {
    expect(() => service.setProjectionAdapter({} as never)).not.toThrow();
    expect(() => service.clearProjectionAdapter()).not.toThrow();
    // No state kept: still null after adapter churn.
    expect(service.getPoligonoParcial()).toBeNull();
  });

  it('no-ops the legacy redraw/clear calls', () => {
    expect(() => {
      service.clearPoligonoParcialRef();
      service.limpiarCapasParciales();
      service.redibujarParcial([], '#00A86B', [], () => undefined);
      service.actualizarParcialEnDrag([], '#00A86B', [], 0, {});
      service.updatePartialPolygonLatLngs([[0, 0]], '#00A86B');
      service.destroy();
    }).not.toThrow();
  });

  it('redibujarParcial invokes nothing on the provided marker callback', () => {
    const onMarkerDrag = vi.fn();

    service.redibujarParcial([], '#00A86B', [], onMarkerDrag);

    expect(onMarkerDrag).not.toHaveBeenCalled();
  });
});
