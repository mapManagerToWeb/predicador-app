import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapPartialDrawService } from './map-partial-draw.service';
import { MapEngineService } from './map-engine.service';
import { polygon as polygonMock, marker as markerMock, divIcon as divIconMock } from 'leaflet';

const { poly } = vi.hoisted(() => {
  const p = { setLatLngs: vi.fn(), addTo: vi.fn(), on: vi.fn() };
  p.addTo.mockReturnValue(p);
  return { poly: p };
});

vi.mock('leaflet', () => ({
  polygon: vi.fn(() => poly),
  marker: vi.fn(() => {
    const m = { on: vi.fn(), addTo: vi.fn() };
    m.addTo.mockReturnValue(m);
    return m;
  }),
  divIcon: vi.fn(() => ({})),
}));

function containerPoint(lat: number, lng: number): { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number } {
  const x = lat * 1000;
  const y = lng * 1000;
  return {
    x,
    y,
    distanceTo: (p: { x: number; y: number }) => Math.hypot(x - p.x, y - p.y),
  };
}

const PUNTOS = [
  { latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 },
  { latlng: { lat: 1, lng: 0 }, edgeIdx: -1, t: 0 },
];

describe('MapPartialDrawService', () => {
  let service: MapPartialDrawService;
  let engine: { getMap: ReturnType<typeof vi.fn> };
  let fakeMap: {
    addLayer: ReturnType<typeof vi.fn>;
    removeLayer: ReturnType<typeof vi.fn>;
    latLngToContainerPoint: (ll: { lat: number; lng: number }) => { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number };
  };

  beforeEach(() => {
    fakeMap = {
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      latLngToContainerPoint: (ll: { lat: number; lng: number }) => containerPoint(ll.lat, ll.lng),
    };
    engine = { getMap: vi.fn().mockReturnValue(fakeMap) };
    TestBed.configureTestingModule({
      providers: [MapPartialDrawService, { provide: MapEngineService, useValue: engine }],
    });
    service = TestBed.inject(MapPartialDrawService);
    vi.clearAllMocks();
  });

  it('starts without a partial polygon and clears references safely', () => {
    expect(service.getPoligonoParcial()).toBeNull();
    service.clearPoligonoParcialRef();
    expect(service.getPoligonoParcial()).toBeNull();
  });

  it('cleans up without a map without throwing', () => {
    engine.getMap.mockReturnValue(null);

    expect(() => service.limpiarCapasParciales()).not.toThrow();
  });

  it('does nothing when redrawing with no points', () => {
    service.redibujarParcial([], '#fff', [], vi.fn());

    expect(polygonMock).not.toHaveBeenCalled();
    expect(markerMock).not.toHaveBeenCalled();
    expect(service.getPoligonoParcial()).toBeNull();
  });

  it('redraws a polygon and its markers for the given points', () => {
    service.redibujarParcial(PUNTOS, '#ff0000', [], vi.fn());

    expect(polygonMock).toHaveBeenCalledTimes(1);
    expect(markerMock).toHaveBeenCalledTimes(2);
    expect(divIconMock).toHaveBeenCalled();
    expect(service.getPoligonoParcial()).not.toBeNull();
  });

  it('wires the drag handler onto every partial marker', () => {
    const onMarkerDrag = vi.fn();
    service.redibujarParcial(PUNTOS, '#ff0000', [], onMarkerDrag);

    const firstMarker = markerMock.mock.results[0].value as { on: ReturnType<typeof vi.fn> };
    const dragCallback = firstMarker.on.mock.calls.find(call => call[0] === 'drag')?.[1];
    expect(dragCallback).toBeDefined();
    dragCallback();
    expect(onMarkerDrag).toHaveBeenCalledWith(0, firstMarker);
  });

  it('updatePartialPolygonLatLngs updates an existing polygon', () => {
    service.redibujarParcial(PUNTOS, '#ff0000', [], vi.fn());
    poly.setLatLngs.mockClear();

    service.updatePartialPolygonLatLngs(
      [
        { lat: 0, lng: 0 },
        { lat: 2, lng: 2 },
      ],
      '#ff0000',
    );

    expect(poly.setLatLngs).toHaveBeenCalledTimes(1);
    expect(service.getPoligonoParcial()).not.toBeNull();
  });

  it('updatePartialPolygonLatLngs removes the polygon when it has fewer than 2 points', () => {
    service.redibujarParcial(PUNTOS, '#ff0000', [], vi.fn());

    service.updatePartialPolygonLatLngs([{ lat: 0, lng: 0 }], '#ff0000');

    expect(fakeMap.removeLayer).toHaveBeenCalled();
    expect(service.getPoligonoParcial()).toBeNull();
  });

  it('destroy clears the partial layers', () => {
    service.redibujarParcial(PUNTOS, '#ff0000', [], vi.fn());

    service.destroy();

    expect(service.getPoligonoParcial()).toBeNull();
  });
});
