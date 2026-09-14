import type { ManzanaIndex } from '../types/map.types';

/**
 * Uniform spatial grid over manzana bounding boxes.
 *
 * Hit-testing a tap used to scan every manzana linearly (O(V)); this grid
 * buckets each manzana into every cell its bbox touches so a tap only
 * inspects the manzanas of one cell (O(1) on average).
 *
 * The grid is a pure class (no Angular DI) so it can be unit-tested without
 * mocking Leaflet. Cell size is in degrees: 0.002° ≈ 200 m at the equator,
 * which keeps the per-cell candidate list small for city-scale manzanas.
 */
export class ManzanaSpatialIndex {
  static readonly DEFAULT_CELL_SIZE = 0.002;

  private readonly cellSize: number;
  private readonly cells = new Map<string, ManzanaIndex[]>();

  constructor(cellSize: number = ManzanaSpatialIndex.DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  /** Inserts a manzana into every cell its bbox touches. */
  insert(mc: ManzanaIndex): void {
    if (!this.hasFiniteBBox(mc)) return;
    const { minX, maxX, minY, maxY } = this.cellRange(mc);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = this.cellKey(x, y);
        const bucket = this.cells.get(key);
        if (bucket) {
          bucket.push(mc);
        } else {
          this.cells.set(key, [mc]);
        }
      }
    }
  }

  /** Removes a manzana from every cell it was inserted into. */
  remove(mc: ManzanaIndex): void {
    if (!this.hasFiniteBBox(mc)) return;
    const { minX, maxX, minY, maxY } = this.cellRange(mc);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = this.cellKey(x, y);
        const bucket = this.cells.get(key);
        if (!bucket) {
          continue;
        }
        const idx = bucket.indexOf(mc);
        if (idx !== -1) {
          bucket.splice(idx, 1);
        }
        if (bucket.length === 0) {
          this.cells.delete(key);
        }
      }
    }
  }

  /** Returns the manzanas whose bbox covers the cell containing the point. */
  queryAt(latlng: { lat: number; lng: number }): ManzanaIndex[] {
    const key = this.cellKey(
      Math.floor(latlng.lng / this.cellSize),
      Math.floor(latlng.lat / this.cellSize)
    );
    return this.cells.get(key) ?? [];
  }

  /**
   * Returns the manzanas in the cells within `radiusCells` of the point's
   * cell (a (2*radiusCells+1)² window). Deduplicates manzanas that span
   * several cells of the window.
   */
  queryNear(latlng: { lat: number; lng: number }, radiusCells = 1): ManzanaIndex[] {
    const cx = Math.floor(latlng.lng / this.cellSize);
    const cy = Math.floor(latlng.lat / this.cellSize);
    const seen = new Set<ManzanaIndex>();
    for (let x = cx - radiusCells; x <= cx + radiusCells; x++) {
      for (let y = cy - radiusCells; y <= cy + radiusCells; y++) {
        const bucket = this.cells.get(this.cellKey(x, y));
        if (bucket) {
          for (const mc of bucket) {
            seen.add(mc);
          }
        }
      }
    }
    return [...seen];
  }

  /** Empties the grid. */
  clear(): void {
    this.cells.clear();
  }

  private cellRange(mc: ManzanaIndex): { minX: number; maxX: number; minY: number; maxY: number } {
    const { bbox } = mc;
    return {
      minX: Math.floor(bbox.minLng / this.cellSize),
      maxX: Math.floor(bbox.maxLng / this.cellSize),
      minY: Math.floor(bbox.minLat / this.cellSize),
      maxY: Math.floor(bbox.maxLat / this.cellSize),
    };
  }

  /**
   * Rejects degenerate bboxes (Infinity/-Infinity, p. ej. una geometría sin
   * rings válidos tras el aplanado Polygon/MultiPolygon). Sin esta guarda,
   * cellRange devolvería Infinity y el bucle por celdas de insert/remove se
   * ejecutaría para siempre (página colgada).
   */
  private hasFiniteBBox(mc: ManzanaIndex): boolean {
    const { bbox } = mc;
    return (
      Number.isFinite(bbox.minLat) &&
      Number.isFinite(bbox.maxLat) &&
      Number.isFinite(bbox.minLng) &&
      Number.isFinite(bbox.maxLng)
    );
  }

  private cellKey(x: number, y: number): string {
    return `${x}:${y}`;
  }
}