import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import type { Position } from 'geojson';
import type { ManzanaFeature } from '../admin.models';
import { ANCHO_CALLE_HECHA, ANCHO_CALLE_HECHA_BORDE, cambiarFondo, COLOR_BORDE_CALLE_HECHA, crearMapa, FUENTE_MAPA, temaOscuro } from '../../../core/map/base-map';
import { callesDeZonas } from '../../../core/map/lados';
import { colorFuerte, coloresFuertes } from '../../../core/map/colores';
import { clave, type EstadoCorreccion } from '../utils/correccion';
import { CALIDAD_FOTO, cajaDePuntos, capturarTerritorios, unirCajas, type Caja } from '../../../core/map/captura';

/** Una calle de la manzana que se está editando (para marcar «por calles»). */
export interface CalleVisible {
  indice: number;
  puntos: Position[];
  marcada: boolean;
  /** Ya estaba en el estado anterior: no se puede quitar. */
  bloqueada: boolean;
}

/** Lo que ya estaba antes de la salida que se corrige va en gris. */
const GRIS_BLOQUEADO = '#9ca3af';
/** Color de cada manzana: el de su territorio si viene (varios territorios), si no el color del mapa. */
const delTerritorio = (color: string): ExpressionSpecification => ['coalesce', ['get', 'color'], color];
/** Relleno de lo marcado: lo que ya estaba antes en gris, salvo que se pida verlo con su color. */
export const relleno = (color: string, anterioresEnColor = false): ExpressionSpecification =>
  anterioresEnColor ? delTerritorio(color) : ['case', ['get', 'bloqueada'], GRIS_BLOQUEADO, delTerritorio(color)];
/** Borde de las manzanas que se marcan ahora (cuando lo de antes va con su color): así se distinguen. */
const BORDE_NUEVAS = '#111827';

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
  /**
   * Lo que ya estaba predicado se ve con el color del territorio, igual que lo
   * que se marca ahora (que lleva además un borde grueso). Para registrar una
   * salida: así se ve el territorio como queda. Sin esto, lo de antes va en gris.
   */
  readonly anterioresEnColor = input(false);
  /** Índices de las zonas de calles que ya estaban antes. */
  readonly zonasBloqueadas = input<ReadonlySet<number>>(new Set());
  /** Color por territorio, cuando el mapa muestra varios (si no, todo va con {@link color}). */
  readonly colores = input<Record<number, string> | null>(null);
  /** Calles de una manzana para marcarlas una a una (null: sin edición de calles). */
  readonly calles = input<CalleVisible[] | null>(null);
  /** Colores para pintar: los muy claros, reforzados como en el mapa de los hermanos. */
  private readonly colorMapa = computed(() => colorFuerte(this.color()));
  private readonly coloresMapa = computed(() => {
    const c = this.colores();
    return c ? coloresFuertes(c) : null;
  });
  readonly manzanaClick = output<ManzanaFeature>();
  readonly zonaClick = output<number>();
  readonly calleClick = output<number>();

  protected readonly hover = signal<string | null>(null);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private map: MapLibreMap | null = null;
  private readonly listo = signal(false);
  /** Qué manzana tiene las calles abiertas (para encuadrar solo al cambiar). */
  private callesDe = '';

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
      const colores = this.coloresMapa();
      this.bloqueadas();
      if (!this.listo() || !this.map) return;
      this.dibujarManzanas(manzanas, estado);
      const colorDe = (manzanaId: string | null) =>
        colores && manzanaId ? (colores[Number(manzanaId.slice(0, manzanaId.indexOf('-')))] ?? null) : null;
      void (this.map.getSource('zonas') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: estado.zonas.map((z, i) => ({
          type: 'Feature',
          geometry: z.geometria,
          properties: { indice: i, bloqueada: zonasBloqueadas.has(i), color: colorDe(z.manzanaId) },
        })),
      });
      // La calle predicada de cada zona, remarcada encima de la franja (como en el mapa de los encargados).
      const geometrias = new Map(manzanas.map(m => [clave(m), m.geometry]));
      void (this.map.getSource('calles-hechas') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: estado.zonas.flatMap((z, i) =>
          callesDeZonas([z], id => geometrias.get(id)).map(puntos => ({
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: puntos },
            properties: { bloqueada: zonasBloqueadas.has(i), color: colorDe(z.manzanaId) },
          })),
        ),
      });
    });
    effect(() => {
      const calles = this.calles();
      if (!this.listo() || !this.map) return;
      this.dibujarCalles(calles);
    });
    effect(() => {
      const color = this.colorMapa();
      const enColor = this.anterioresEnColor();
      if (!this.listo() || !this.map) return;
      for (const capa of ['manzanas-fill', 'zonas-fill']) this.map.setPaintProperty(capa, 'fill-color', relleno(color, enColor));
      this.map.setPaintProperty('calles-hechas', 'line-color', relleno(color, enColor));
      this.map.setPaintProperty('manzanas-line', 'line-color', delTerritorio(color));
      this.map.setLayoutProperty('manzanas-nuevas', 'visibility', enColor ? 'visible' : 'none');
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
      paint: { 'fill-color': relleno(this.colorMapa(), this.anterioresEnColor()), 'fill-opacity': ['case', ['get', 'marcada'], 0.75, 0.08] },
    });
    map.addLayer({
      id: 'zonas-fill',
      type: 'fill',
      source: 'zonas',
      // Suave: la calle predicada se remarca encima (capas calles-hechas).
      paint: { 'fill-color': relleno(this.colorMapa(), this.anterioresEnColor()), 'fill-opacity': 0.35 },
    });
    map.addLayer({ id: 'manzanas-line', type: 'line', source: 'manzanas', paint: { 'line-color': delTerritorio(this.colorMapa()), 'line-width': 1.5 } });
    map.addSource('calles-hechas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'calles-hechas-borde',
      type: 'line',
      source: 'calles-hechas',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR_BORDE_CALLE_HECHA, 'line-width': ANCHO_CALLE_HECHA_BORDE, 'line-opacity': 0.8 },
    });
    map.addLayer({
      id: 'calles-hechas',
      type: 'line',
      source: 'calles-hechas',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': relleno(this.colorMapa(), this.anterioresEnColor()), 'line-width': ANCHO_CALLE_HECHA },
    });
    map.addLayer({
      id: 'manzanas-nuevas',
      type: 'line',
      source: 'manzanas',
      filter: ['all', ['get', 'marcada'], ['!', ['get', 'bloqueada']]],
      layout: { 'line-join': 'round', visibility: this.anterioresEnColor() ? 'visible' : 'none' },
      paint: { 'line-color': BORDE_NUEVAS, 'line-width': 3 },
    });
    map.addSource('calles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('calles-numero', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'calles-borde',
      type: 'line',
      source: 'calles',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#111827', 'line-opacity': 0.75, 'line-width': 12 },
    });
    map.addLayer({
      id: 'calles-linea',
      type: 'line',
      source: 'calles',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['get', 'bloqueada'], GRIS_BLOQUEADO, ['get', 'marcada'], '#16a34a', '#ffffff'],
        'line-width': 8,
      },
    });
    map.addLayer({
      id: 'calles-numero',
      type: 'symbol',
      source: 'calles-numero',
      layout: { 'text-field': ['get', 'texto'], 'text-font': [FUENTE_MAPA], 'text-size': 16, 'text-allow-overlap': true },
      paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 2.5 },
    });
    map.addLayer({
      id: 'manzanas-nombre',
      type: 'symbol',
      source: 'manzanas',
      layout: { 'text-field': ['get', 'nombre'], 'text-font': [FUENTE_MAPA], 'text-size': 12 },
      paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });

    map.on('mousemove', e => {
      const calle = this.calleEn(map, e.point);
      if (calle) {
        map.getCanvas().style.cursor = calle.bloqueada ? '' : 'pointer';
        this.hover.set(calle.bloqueada ? `Calle ${calle.indice + 1}: ya estaba antes` : `Calle ${calle.indice + 1}: clic para ${calle.marcada ? 'quitarla' : 'marcarla'}`);
        return;
      }
      const f = map.queryRenderedFeatures(e.point, { layers: ['zonas-fill', 'manzanas-fill'] })[0];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (!f) this.hover.set(null);
      else if (f.properties['bloqueada'])
        this.hover.set(this.anterioresEnColor() ? `Manzana ${f.properties['nombre']}: ya estaba predicada` : 'Ya estaba marcado antes: no se cambia aquí');
      else if (f.layer.id === 'zonas-fill') this.hover.set('Clic: quitar estas calles');
      else this.hover.set(`Manzana ${f.properties['nombre']}: clic para ${f.properties['marcada'] ? 'desmarcar' : 'cambiar'}`);
    });
    map.on('click', e => {
      const calle = this.calleEn(map, e.point);
      if (calle) {
        if (!calle.bloqueada) this.calleClick.emit(calle.indice);
        return;
      }
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
    this.dibujarCalles(this.calles());
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
          color: this.coloresMapa()?.[m.properties.territorio] ?? null,
        },
      })),
    });
  }

  /**
   * Imagen del mapa como se ve ahora (JPEG en base64, sin el prefijo), para el
   * WhatsApp del registro. null si el mapa todavía no está listo.
   */
  capturar(): string | null {
    if (!this.map) return null;
    this.map.triggerRepaint();
    try {
      return this.map.getCanvas().toDataURL('image/jpeg', CALIDAD_FOTO).split(',')[1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Imagen de todos los territorios del mapa para el WhatsApp del registro,
   * enteros aunque ahora se vea solo una parte (ver `core/map/captura.ts`).
   * Las calles de la manzana que se está editando no salen.
   */
  async capturarSalida(): Promise<string | null> {
    const map = this.map;
    if (!map) return null;
    const cajas = new Map<number, Caja>();
    for (const m of this.manzanas()) {
      const caja = cajaDePuntos(coordenadas(m));
      if (!caja) continue;
      const t = m.properties.territorio;
      cajas.set(t, cajas.has(t) ? unirCajas(cajas.get(t)!, caja) : caja);
    }
    // La foto muestra cómo queda el territorio, como la de la app: sin calles a medio elegir ni el borde de lo nuevo.
    const capasCalles = ['calles-borde', 'calles-linea', 'calles-numero'];
    for (const c of [...capasCalles, 'manzanas-nuevas']) map.setLayoutProperty(c, 'visibility', 'none');
    try {
      return await capturarTerritorios(map, cajas);
    } finally {
      for (const c of capasCalles) map.setLayoutProperty(c, 'visibility', 'visible');
      map.setLayoutProperty('manzanas-nuevas', 'visibility', this.anterioresEnColor() ? 'visible' : 'none');
    }
  }

  /**
   * Como `capturar()`, pero espera a que el mapa termine de dibujar lo último
   * que se le pasó (manzanas nuevas y fondo cargado). Para las tarjetas.
   */
  async capturarAlTerminar(maximoMs = 8000): Promise<string | null> {
    // Espera a que el mapa exista y deja que los effects le pasen las manzanas nuevas.
    const hasta = Date.now() + maximoMs;
    while (!this.listo() && Date.now() < hasta) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 80));
    const map = this.map;
    if (!map) return null;
    await new Promise<void>(resolve => {
      const listo = setTimeout(resolve, maximoMs);
      map.once('idle', () => {
        clearTimeout(listo);
        resolve();
      });
      map.triggerRepaint();
    });
    return this.capturar();
  }

  /** La calle bajo el puntero, con un margen para que sea fácil acertarle. */
  private calleEn(map: MapLibreMap, p: { x: number; y: number }): CalleVisible | null {
    const calles = this.calles();
    if (!calles?.length) return null;
    const f = map.queryRenderedFeatures([[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]], { layers: ['calles-borde'] })[0];
    return f ? (calles.find(c => c.indice === Number(f.properties['indice'])) ?? null) : null;
  }

  private dibujarCalles(calles: CalleVisible[] | null): void {
    const map = this.map;
    if (!map) return;
    const lista = calles ?? [];
    void (map.getSource('calles') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: lista.map(c => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: c.puntos },
        properties: { indice: c.indice, marcada: c.marcada, bloqueada: c.bloqueada },
      })),
    });
    void (map.getSource('calles-numero') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: lista.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c.puntos[Math.floor(c.puntos.length / 2)] ?? c.puntos[0] },
        properties: { texto: c.marcada || c.bloqueada ? '✓' : String(c.indice + 1) },
      })),
    });
    // Al abrir las calles de una manzana, el mapa se acerca a ella (solo al abrirla, no en cada clic).
    const pts = lista.flatMap(c => c.puntos);
    const manzana = pts.length ? JSON.stringify(pts[0]) + lista.length : '';
    const otraManzana = manzana !== this.callesDe;
    this.callesDe = manzana;
    if (pts.length && otraManzana) {
      const xs = pts.map(q => q[0]);
      const ys = pts.map(q => q[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, duration: 300, maxZoom: 19 });
    }
  }

  private encuadrar(manzanas: ManzanaFeature[]): void {
    const pts = manzanas.flatMap(coordenadas);
    if (!pts.length || !this.map) return;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const caja: LngLatBoundsLike = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    this.map.fitBounds(caja, { padding: 40, duration: 0, maxZoom: 18 });
  }
}

function coordenadas(m: ManzanaFeature): Position[] {
  return m.geometry.type === 'Polygon' ? m.geometry.coordinates.flat() : m.geometry.coordinates.flat(2);
}
