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
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { ManzanasCollection } from '../admin.models';
import { cambiarFondo, crearMapa, etiquetasTerritorios, limitesPrincipales, temaOscuro } from '../../../core/map/base-map';

/**
 * Mapa de solo lectura que pinta cada manzana con el color asignado a su
 * territorio (`colores`). Se usa para la cobertura del resumen.
 */
@Component({
  selector: 'app-coverage-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #contenedor class="cov-map" [style.height.px]="alto()"></div>
    @if (hover(); as h) {
      <div class="cov-hover">{{ h }}</div>
    }
    @if (error()) {
      <p class="cov-error">No se pudo cargar el mapa.</p>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .cov-map { border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-2); }
    .cov-hover {
      position: absolute; top: 8px; left: 8px; padding: 6px 10px; border-radius: var(--radius-sm);
      background: var(--surface-1); box-shadow: var(--elev-2); font-size: var(--text-sm); pointer-events: none;
    }
    .cov-error { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--ink-muted); }
  `,
})
export class CoverageMap {
  readonly manzanas = input.required<ManzanasCollection>();
  /** Color de relleno por territorio (valor CSS resuelto, p. ej. "#0ca30c"). */
  readonly colores = input.required<Record<number, string>>();
  /** Texto del recuadro al pasar sobre un territorio. */
  readonly describir = input<(territorio: number) => string>(t => `Territorio ${t}`);
  readonly alto = input(420);
  readonly territorioClick = output<number>();

  protected readonly hover = signal<string | null>(null);
  protected readonly error = signal(false);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private map: MapLibreMap | null = null;
  private readonly listo = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      void this.iniciar().catch(() => this.error.set(true));
      const observer = new MutationObserver(() => {
        if (this.map) cambiarFondo(this.map, 'mapa', temaOscuro());
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      destroyRef.onDestroy(() => {
        observer.disconnect();
        this.map?.remove();
      });
    });

    effect(() => {
      const coleccion = this.manzanas();
      if (!this.listo() || !this.map) return;
      void (this.map.getSource('manzanas') as GeoJSONSource).setData(coleccion);
      void (this.map.getSource('etiquetas') as GeoJSONSource).setData(etiquetasTerritorios(coleccion));
    });
    effect(() => {
      const colores = this.colores();
      if (!this.listo() || !this.map) return;
      this.map.setPaintProperty('manzanas-fill', 'fill-color', expresionColor(colores));
    });
  }

  private async iniciar(): Promise<void> {
    const { map } = await crearMapa(this.contenedor().nativeElement, 'mapa', true);
    this.map = map;
    const coleccion = this.manzanas();
    map.addSource('manzanas', { type: 'geojson', data: coleccion });
    map.addSource('etiquetas', { type: 'geojson', data: etiquetasTerritorios(coleccion) });
    map.addLayer({
      id: 'manzanas-fill',
      type: 'fill',
      source: 'manzanas',
      paint: { 'fill-color': expresionColor(this.colores()), 'fill-opacity': 0.55 },
    });
    map.addLayer({
      id: 'manzanas-line',
      type: 'line',
      source: 'manzanas',
      paint: { 'line-color': expresionColor(this.colores()), 'line-width': 1 },
    });
    map.addLayer({
      id: 'etiquetas',
      type: 'symbol',
      source: 'etiquetas',
      minzoom: 13,
      layout: { 'text-field': ['get', 'etiqueta'], 'text-font': ['Open Sans Semibold'], 'text-size': 12 },
      paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    map.on('mousemove', 'manzanas-fill', e => {
      const t = e.features?.[0]?.properties?.['territorio'] as number | undefined;
      map.getCanvas().style.cursor = t === undefined ? '' : 'pointer';
      this.hover.set(t === undefined ? null : this.describir()(t));
    });
    map.on('mouseleave', 'manzanas-fill', () => {
      map.getCanvas().style.cursor = '';
      this.hover.set(null);
    });
    map.on('click', 'manzanas-fill', e => {
      const t = e.features?.[0]?.properties?.['territorio'] as number | undefined;
      if (t !== undefined) this.territorioClick.emit(t);
    });
    const caja = limitesPrincipales(coleccion);
    if (caja) map.fitBounds(caja, { padding: 24, duration: 0 });
    this.listo.set(true);
  }
}

function expresionColor(colores: Record<number, string>): ExpressionSpecification | string {
  const pares = Object.entries(colores).flatMap(([t, c]) => [Number(t), c]);
  if (pares.length === 0) return '#888888';
  return ['match', ['get', 'territorio'], ...pares, '#888888'] as unknown as ExpressionSpecification;
}
