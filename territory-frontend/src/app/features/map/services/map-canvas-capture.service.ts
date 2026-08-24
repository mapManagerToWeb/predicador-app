import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';

const CAPTURE_PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.85;

/**
 * Renders the current (already styled) map state to an offscreen canvas and
 * returns a JPEG base64 payload — no DOM serialization involved.
 *
 * <p>Replaces html-to-image: SVG foreignObject serialization is broken on
 * iOS WebKit (blank tiles, see bubkoo/html-to-image#461). Drawing tiles and
 * vectors directly onto a canvas behaves identically on every browser.</p>
 *
 * <p>The renderer draws whatever prepararCaptura left on the map: every
 * L.Path using its live style options (hidden territories have opacity 0 and
 * are skipped), so capture styling logic stays in one place.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapCanvasCaptureService {
  private engine = inject(MapEngineService);
  private territories = inject(MapTerritoryLayerService);

  /** Returns JPEG base64 (no data: prefix) of the visible map, or null. */
  capture(): string | null {
    const map = this.engine.getMap();
    if (!map || typeof document === 'undefined') return null;

    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = size.x * CAPTURE_PIXEL_RATIO;
    canvas.height = size.y * CAPTURE_PIXEL_RATIO;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(CAPTURE_PIXEL_RATIO, CAPTURE_PIXEL_RATIO);

    this.drawTiles(map, ctx);
    this.drawPaths(map, ctx);
    this.drawLabels(ctx);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? null;
  }

  /** Tiles are already positioned by Leaflet; reuse their on-screen rects. */
  private drawTiles(map: L.Map, ctx: CanvasRenderingContext2D): void {
    const container = map.getContainer();
    const origin = container.getBoundingClientRect();
    const tiles = container.querySelectorAll('.leaflet-tile-pane img');
    for (const tile of tiles) {
      const img = tile as HTMLImageElement;
      if (!img.complete || !img.naturalWidth) continue;
      const r = img.getBoundingClientRect();
      try {
        ctx.drawImage(img, r.left - origin.left, r.top - origin.top, r.width, r.height);
      } catch {
        // Tile sin CORS (debería ser imposible con crossOrigin activo):
        // se dibuja el hueco en blanco en vez de romper toda la captura.
      }
    }
  }

  private drawPaths(map: L.Map, ctx: CanvasRenderingContext2D): void {
    map.eachLayer(layer => {
      // Dos niveles alcanzan: GeoJSON groups (manzanas) y capas sueltas
      // (polígonos parciales). No hay grupos anidados más profundo.
      if (layer instanceof L.LayerGroup) {
        layer.eachLayer(child => this.drawPath(map, child, ctx));
      } else {
        this.drawPath(map, layer, ctx);
      }
    });
  }

  private drawPath(map: L.Map, layer: L.Layer, ctx: CanvasRenderingContext2D): void {
    if (!(layer instanceof L.Path)) return;
    const opts = layer.options;
    // Estilo oculto (getHiddenStyle): nada que dibujar.
    if (!opts.opacity && !opts.fillOpacity) return;

    const rings = this.projectRings(layer, map);
    if (!rings.length) return;

    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.closePath();
    }

    if (opts.fill && opts.fillOpacity !== 0) {
      ctx.globalAlpha = opts.fillOpacity ?? 1;
      ctx.fillStyle = opts.fillColor ?? opts.color ?? '#000';
      ctx.fill('evenodd');
    }

    if (opts.stroke !== false && opts.weight && opts.weight > 0 && opts.opacity) {
      ctx.globalAlpha = opts.opacity;
      ctx.strokeStyle = opts.color ?? '#000';
      ctx.lineWidth = opts.weight;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const dash = opts.dashArray;
      ctx.setLineDash(
        Array.isArray(dash) ? dash : dash ? dash.split(/[\s,]+/).map(Number) : []
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1;
  }

  private projectRings(path: L.Path, map: L.Map): L.Point[][] {
    const polygon = path as unknown as { getLatLngs?: () => unknown };
    if (typeof polygon.getLatLngs !== 'function') return [];

    const raw = polygon.getLatLngs!() as unknown[];
    // Polygon → LatLng[][]; Polyline → LatLng[]. Normalizamos a anillos.
    const rings = (Array.isArray(raw[0]) ? raw : [raw]) as L.LatLng[][];
    return rings.map(ring =>
      ring.map(ll => map.latLngToContainerPoint(ll))
    );
  }

  /** Píldora con el número de territorio, replicando .territory-label__text. */
  private drawLabels(ctx: CanvasRenderingContext2D): void {
    const map = this.engine.getMap();
    if (!map) return;
    const dark = document.documentElement.dataset['theme'] === 'dark';
    for (const lbl of this.territories.getTerritoryLabels()) {
      // Leaflet 1.9 no expone getOpacity(); setOpacity escribe options.opacity.
      if ((lbl.options.opacity ?? 1) !== 1) continue;
      const latlng = lbl.getLatLng();
      if (!latlng) continue;
      const pt = map.latLngToContainerPoint(latlng);

      const text = String(this.labelNumber(lbl));
      ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      const metrics = ctx.measureText(text);
      const w = Math.max(24, metrics.width + 12);
      const h = 24;
      const x = pt.x - w / 2;
      const y = pt.y - h / 2;
      const radius = h / 2;

      ctx.globalAlpha = 0.96;
      ctx.fillStyle = dark ? '#242220' : '#FDFBF7';
      this.drawPill(ctx, x, y, w, h, radius);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = dark ? '#F5F2EB' : '#1C1A18';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, pt.x, pt.y + 1);
    }
  }

  private labelNumber(lbl: L.Marker): number | string {
    const el = lbl.getElement();
    const text = el?.querySelector('.territory-label__text')?.textContent;
    return text ?? '';
  }

  /**
   * roundRect() solo existe desde iOS 16 / Chrome 99; en WebKit anterior la
   * captura entera fallaría. El trazado manual con arcTo es equivalente.
   */
  private drawPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
