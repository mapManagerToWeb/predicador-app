import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { ManzanaFeature } from '../admin.models';
import { cambiarFondo, crearMapa, temaOscuro } from '../../../core/map/base-map';
import { clave, type EstadoCorreccion } from '../utils/correccion';

/** Lo que ya estaba antes de la salida que se corrige va en gris. */
const GRIS_BLOQUEADO = '#9ca3af';
const relleno = (color: string): ExpressionSpecification => ['case', ['get', 'bloqueada'], GRIS_BLOQUEADO, color];

/**
 * Mapa de un territorio para corregir su estado: las manzanas marcadas enteras
 * van rellenas, las marcadas por calles muestran la franja. Clic en una
 * manzana o en una zona avisa al padre (que decide qué cambia).
 */
@Component({
  selector: 'app-correccion-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #contenedor class="corr-map" [style.height.px]="alto()"></div>
    @if (hover(); as h) {
      <div class="corr-hover">{{ h }}</div>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .corr-map { border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-2); }
    .corr-hover {
      position: absolute; top: 8px; left: 8px; padding: 6px 10px; border-radius: var(--radius-sm);
      background: var(--surface-1); box-shadow: var(--elev-2); font-size: var(--text-sm); pointer-events: none;
    }
  `,
})
export class CorreccionMap {
  readonly manzanas = input.required<ManzanaFeature[]>();
  readonly estado = input.required<EstadoCorreccion>();
  readonly color = input('#2563eb');
  readonly alto = input(460);
  /** Manzanas que ya estaban marcadas antes (al corregir una salida): en gris, no se tocan. */
  readonly bloqueadas = input<ReadonlySet<string>>(new Set());
  /** Índices de las zonas de calles que ya estaban antes. */
  readonly zonasBloqueadas = input<ReadonlySet<number>>(new Set());
  readonly manzanaClick = output<ManzanaFeature>();
  readonly zonaClick = output<number>();

  protected readonly hover = signal<string | null>(null);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private map: MapLibreMap | null = null;
  private readonly listo = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      void this.iniciar();
      const observer = new MutationObserver(() => {
        if (this.map) cambiarFondo(this.map, 'mapa', temaOscuro());
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      destroyRef.onDestroy(() => {
        observer.disconnect();
        this.map?.remove();
      });
    });

    // Otro territorio: se cambian las manzanas y se encuadra.
    effect(() => {
      const manzanas = this.manzanas();
      if (!this.listo() || !this.map) return;
      this.dibujarManzanas(manzanas);
      this.encuadrar(manzanas);
    });
    effect(() => {
      const estado = this.estado();
      const manzanas = this.manzanas();
      const zonasBloqueadas = this.zonasBloqueadas();
      this.bloqueadas();
      if (!this.listo() || !this.map) return;
      this.dibujarManzanas(manzanas, estado);
      void (this.map.getSource('zonas') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: estado.zonas.map((z, i) => ({
          type: 'Feature',
          geometry: z.geometria,
          properties: { indice: i, bloqueada: zonasBloqueadas.has(i) },
        })),
      });
    });
    effect(() => {
      const color = this.color();
      if (!this.listo() || !this.map) return;
      for (const capa of ['manzanas-fill', 'zonas-fill']) this.map.setPaintProperty(capa, 'fill-color', relleno(color));
      this.map.setPaintProperty('manzanas-line', 'line-color', color);
    });
  }

  private async iniciar(): Promise<void> {
    const { map } = await crearMapa(this.contenedor().nativeElement, 'mapa', true);
    this.map = map;
    map.addSource('manzanas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('zonas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'manzanas-fill',
      type: 'fill',
      source: 'manzanas',
      paint: { 'fill-color': relleno(this.color()), 'fill-opacity': ['case', ['get', 'marcada'], 0.75, 0.08] },
    });
    map.addLayer({ id: 'zonas-fill', type: 'fill', source: 'zonas', paint: { 'fill-color': relleno(this.color()), 'fill-opacity': 0.75 } });
    map.addLayer({ id: 'manzanas-line', type: 'line', source: 'manzanas', paint: { 'line-color': this.color(), 'line-width': 1.5 } });
    map.addLayer({
      id: 'manzanas-nombre',
      type: 'symbol',
      source: 'manzanas',
      layout: { 'text-field': ['get', 'nombre'], 'text-font': ['Open Sans Semibold'], 'text-size': 12 },
      paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });

    map.on('mousemove', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['zonas-fill', 'manzanas-fill'] })[0];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (!f) this.hover.set(null);
      else if (f.properties['bloqueada']) this.hover.set('Ya estaba marcado antes: no se cambia aquí');
      else if (f.layer.id === 'zonas-fill') this.hover.set('Clic: quitar estas calles');
      else this.hover.set(`Manzana ${f.properties['nombre']}: clic para ${f.properties['marcada'] ? 'desmarcar' : 'cambiar'}`);
    });
    map.on('click', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['zonas-fill', 'manzanas-fill'] })[0];
      if (!f) return;
      if (f.layer.id === 'zonas-fill') {
        this.zonaClick.emit(Number(f.properties['indice']));
        return;
      }
      const m = this.manzanas().find(x => clave(x) === f.properties['clave']);
      if (m) this.manzanaClick.emit(m);
    });
    this.listo.set(true);
    this.dibujarManzanas(this.manzanas(), this.estado());
    this.encuadrar(this.manzanas());
  }

  private dibujarManzanas(manzanas: ManzanaFeature[], estado = this.estado()): void {
    void (this.map?.getSource('manzanas') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: manzanas.map(m => ({
        type: 'Feature',
        geometry: m.geometry,
        properties: {
          clave: clave(m),
          nombre: m.properties.nombre,
          marcada: estado.marcadas.has(clave(m)),
          bloqueada: this.bloqueadas().has(clave(m)),
        },
      })),
    });
  }

  private encuadrar(manzanas: ManzanaFeature[]): void {
    const pts = manzanas.flatMap(m => (m.geometry.type === 'Polygon' ? m.geometry.coordinates.flat() : m.geometry.coordinates.flat(2)));
    if (!pts.length || !this.map) return;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const caja: LngLatBoundsLike = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    this.map.fitBounds(caja, { padding: 40, duration: 0, maxZoom: 18 });
  }
}
