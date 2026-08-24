import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapCanvasCaptureService } from './map-canvas-capture.service';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';

type Ctx2D = Record<string, ReturnType<typeof vi.fn>> & {
  canvas: { width: number; height: number };
};

function createCtx(): Ctx2D {
  const ctx: Record<string, unknown> = {};
  for (const fn of [
    'scale', 'drawImage', 'beginPath', 'moveTo', 'lineTo', 'closePath',
    'fill', 'stroke', 'setLineDash', 'fillText', 'roundRect', 'measureText',
  ]) {
    ctx[fn] = vi.fn();
  }
  ctx['measureText'] = vi.fn().mockReturnValue({ width: 20 });
  ctx['fillStyle'] = '';
  ctx['globalAlpha'] = 1;
  return ctx as unknown as Ctx2D;
}

function createMapContainer(): HTMLElement {
  const el = document.createElement('div');
  // jsdom no hace layout: damos tamaño explícito para que la proyección
  // de Leaflet (fijada al crear el mapa) centre los puntos correctamente.
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  return el;
}

describe('MapCanvasCaptureService', () => {
  let ctx: Ctx2D;
  let canvasEl: HTMLCanvasElement;
  let map: L.Map;
  let container: HTMLElement;
  let engine: MapEngineService;
  let territories: MapTerritoryLayerService;
  let service: MapCanvasCaptureService;

  beforeEach(() => {
    ctx = createCtx();

    canvasEl = document.createElement('canvas');
    container = createMapContainer();

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvasEl;
      return realCreateElement(tag);
    });
    vi.spyOn(canvasEl, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvasEl, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD');

    map = L.map(container, { center: [0, 0], zoom: 15 });
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => new DOMRect(10, 10, 800, 600),
      configurable: true,
    });

    engine = { getMap: () => map } as unknown as MapEngineService;
    territories = { getTerritoryLabels: () => [] } as unknown as MapTerritoryLayerService;
    TestBed.configureTestingModule({
      providers: [
        MapCanvasCaptureService,
        { provide: MapEngineService, useValue: engine },
        { provide: MapTerritoryLayerService, useValue: territories },
      ],
    });
    service = TestBed.inject(MapCanvasCaptureService);
  });

  afterEach(() => {
    map.remove();
    vi.restoreAllMocks();
  });

  it('returns null without a map', () => {
    (engine as Partial<MapEngineService>).getMap = () => null;
    expect(service.capture()).toBeNull();
  });

  it('draws loaded tiles at their on-screen position and returns base64 jpeg', () => {
    const tile = document.createElement('img');
    Object.defineProperty(tile, 'complete', { value: true });
    Object.defineProperty(tile, 'naturalWidth', { value: 256 });
    vi.spyOn(container, 'querySelectorAll').mockReturnValue([tile] as unknown as NodeListOf<Element>);
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 256, 256));

    const result = service.capture();

    expect(result).toBe('QUJD');
    expect(ctx.drawImage).toHaveBeenCalledWith(tile, 10, 20, 256, 256);
    expect(canvasEl.width).toBe(1600);
    expect(canvasEl.height).toBe(1200);
  });

  it('skips tiles that are not complete', () => {
    const tile = document.createElement('img');
    Object.defineProperty(tile, 'complete', { value: false });
    vi.spyOn(container, 'querySelectorAll').mockReturnValue([tile] as unknown as NodeListOf<Element>);

    service.capture();

    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('draws visible paths with their live style options', () => {
    const polygon = L.polygon([[0, 0], [0, 1], [1, 1]], {
      color: '#ff0000',
      fillColor: '#ff0000',
      fillOpacity: 0.95,
      opacity: 1,
      weight: 4,
    });
    polygon.addTo(map);

    service.capture();

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#ff0000');
    expect(ctx.lineWidth).toBe(4);
  });

  it('skips hidden paths (opacity 0 and fillOpacity 0)', () => {
    const hidden = L.polygon([[0, 0], [0, 1], [1, 1]], { opacity: 0, fillOpacity: 0 });
    hidden.addTo(map);

    service.capture();

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('applies dashArray for partial polygons', () => {
    const partial = L.polygon([[0, 0], [0, 1], [1, 1]], {
      color: '#123456',
      weight: 4,
      opacity: 1,
      fillOpacity: 0,
      dashArray: '8, 8',
    });
    partial.addTo(map);

    service.capture();

    expect(ctx.setLineDash).toHaveBeenCalledWith([8, 8]);
  });

  it('draws only labels with opacity 1', () => {
    const visible = L.marker([0, 0], { opacity: 1 });
    const hidden = L.marker([1, 1], { opacity: 0 });
    visible.addTo(map);
    hidden.addTo(map);
    const span = document.createElement('span');
    span.className = 'territory-label__text';
    span.textContent = '7';
    const icon = document.createElement('div');
    icon.appendChild(span);
    vi.spyOn(visible, 'getElement').mockReturnValue(icon);
    (territories as { getTerritoryLabels: () => L.Marker[] }).getTerritoryLabels =
      () => [visible, hidden];

    service.capture();

    expect(ctx.fillText).toHaveBeenCalledWith('7', expect.any(Number), expect.any(Number));
  });
});

