import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  MapMouseEvent,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { TerraDraw, TerraDrawMouseEvent, SnappableContext } from 'terra-draw';
import type { Polygon, Position } from 'geojson';
import type { ManzanaFeature, ManzanasCollection } from '../admin.models';
import { cambiarFondo, crearMapa, etiquetasTerritorios, type FondoMapa, limites, limitesPrincipales, temaOscuro } from './base-map';

/** Distancia (px) a la que un vértice nuevo se pega al de una manzana vecina. */
const TOLERANCIA_SNAP_PX = 10;
const COLOR_EDICION = '#3b82f6';

export interface EventosEditor {
  clickManzana(id: number, agregar: boolean): void;
  clickVacio(): void;
  /** El usuario cerró el polígono que estaba dibujando. */
  dibujoTerminado(): void;
}

/**
 * Mapa del editor: MapLibre para ver las manzanas y terra-draw para dibujar
 * o mover vértices. La página decide qué hacer; esta clase solo dibuja y avisa.
 */
export class EditorMapa {
  private draw: TerraDraw | null = null;
  private idDibujo: string | number | null = null;
  private vertices: Position[] = [];
  private seleccion = new Set<number>();
  private fondo: FondoMapa = 'mapa';
  private readonly observadorTema: MutationObserver;

  private constructor(
    private readonly map: MapLibreMap,
    private readonly eventos: EventosEditor,
  ) {
    this.observadorTema = new MutationObserver(() => cambiarFondo(this.map, this.fondo, temaOscuro()));
    this.observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  static async crear(contenedor: HTMLElement, eventos: EventosEditor): Promise<EditorMapa> {
    const { map } = await crearMapa(contenedor);
    const editor = new EditorMapa(map, eventos);
    editor.agregarCapas();
    await editor.iniciarTerraDraw();
    return editor;
  }

  private agregarCapas(): void {
    const vacio: ManzanasCollection = { type: 'FeatureCollection', features: [] };
    this.map.addSource('manzanas', { type: 'geojson', data: vacio });
    this.map.addSource('etiquetas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    this.map.addLayer({
      id: 'manzanas-fill',
      type: 'fill',
      source: 'manzanas',
      paint: {
        'fill-color': '#888888',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.6, 0.3],
      },
    });
    this.map.addLayer({
      id: 'manzanas-line',
      type: 'line',
      source: 'manzanas',
      paint: { 'line-color': '#888888', 'line-width': 1 },
    });
    this.map.addLayer({
      id: 'manzanas-invalidas',
      type: 'line',
      source: 'manzanas',
      filter: ['==', ['get', 'valida'], false],
      paint: { 'line-color': '#d03b3b', 'line-width': 2.5, 'line-dasharray': [2, 1] },
    });
    this.map.addLayer({
      id: 'manzanas-sel',
      type: 'line',
      source: 'manzanas',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0],
      },
    });
    this.map.addLayer({
      id: 'manzanas-nombres',
      type: 'symbol',
      source: 'manzanas',
      minzoom: 16,
      layout: { 'text-field': ['get', 'nombre'], 'text-font': ['Open Sans Semibold'], 'text-size': 11 },
      paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
    });
    this.map.addLayer({
      id: 'etiquetas',
      type: 'symbol',
      source: 'etiquetas',
      maxzoom: 16,
      minzoom: 12.5,
      layout: {
        'text-field': ['get', 'etiqueta'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 13,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    });

    this.map.on('click', (e: MapMouseEvent) => {
      if (this.idDibujo !== null || this.draw?.getMode() !== 'static') return;
      const f = this.map.queryRenderedFeatures(e.point, { layers: ['manzanas-fill'] })[0];
      if (f?.id !== undefined) {
        this.eventos.clickManzana(Number(f.id), e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
      } else {
        this.eventos.clickVacio();
      }
    });
    this.map.on('mousemove', 'manzanas-fill', () => {
      if (this.draw?.getMode() === 'static') this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'manzanas-fill', () => {
      if (this.draw?.getMode() === 'static') this.map.getCanvas().style.cursor = '';
    });
  }

  private async iniciarTerraDraw(): Promise<void> {
    const [td, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
      import('terra-draw'),
      import('terra-draw-maplibre-gl-adapter'),
    ]);
    const snap = { toCustom: (evento: TerraDrawMouseEvent, ctx: SnappableContext) => this.snap(evento, ctx) };
    const estilo = {
      fillColor: COLOR_EDICION,
      fillOpacity: 0.25,
      outlineColor: COLOR_EDICION,
      outlineWidth: 2,
    } as const;
    this.draw = new td.TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: this.map }),
      modes: [
        new td.TerraDrawPolygonMode({
          snapping: snap,
          validation: feature => td.ValidateNotSelfIntersecting(feature),
          styles: { ...estilo, closingPointColor: COLOR_EDICION, closingPointWidth: 6 },
        }),
        new td.TerraDrawSelectMode({
          flags: {
            polygon: {
              feature: {
                draggable: false,
                selfIntersectable: false,
                coordinates: { draggable: true, midpoints: true, deletable: true, snappable: snap },
              },
            },
          },
          styles: {
            selectedPolygonColor: COLOR_EDICION,
            selectedPolygonFillOpacity: 0.25,
            selectedPolygonOutlineColor: COLOR_EDICION,
            selectedPolygonOutlineWidth: 2,
            selectionPointColor: '#ffffff',
            selectionPointOutlineColor: COLOR_EDICION,
            selectionPointWidth: 5,
            midPointColor: COLOR_EDICION,
            midPointWidth: 3,
          },
          allowManualDeselection: false,
        }),
      ],
    });
    this.draw.start();
    this.draw.setMode('static');
    this.draw.on('finish', (id, contexto) => {
      if (contexto.mode === 'polygon' && contexto.action === 'draw') {
        this.idDibujo = id;
        this.draw?.setMode('select');
        this.draw?.selectFeature(id);
        this.eventos.dibujoTerminado();
      }
    });
  }

  setDatos(coleccion: ManzanasCollection, colores: Record<number, string>): void {
    void (this.map.getSource('manzanas') as GeoJSONSource).setData(coleccion);
    void (this.map.getSource('etiquetas') as GeoJSONSource).setData(etiquetasTerritorios(coleccion));
    this.vertices = coleccion.features.flatMap(f =>
      (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()).flat(),
    );
    this.setColores(colores);
    this.setSeleccion(this.seleccion, null);
  }

  setColores(colores: Record<number, string>): void {
    const pares = Object.entries(colores).flatMap(([t, c]) => [Number(t), c]);
    const color = (pares.length
      ? ['match', ['get', 'territorio'], ...pares, '#888888']
      : '#888888') as unknown as ExpressionSpecification;
    this.map.setPaintProperty('manzanas-fill', 'fill-color', color);
    this.map.setPaintProperty('manzanas-line', 'line-color', color);
  }

  /** Resalta manzanas y engrosa el borde del territorio activo. */
  setSeleccion(ids: Set<number>, territorio: number | null): void {
    for (const id of this.seleccion) this.map.setFeatureState({ source: 'manzanas', id }, { sel: false });
    this.seleccion = new Set(ids);
    for (const id of this.seleccion) this.map.setFeatureState({ source: 'manzanas', id }, { sel: true });
    this.map.setPaintProperty(
      'manzanas-line',
      'line-width',
      territorio === null ? 1 : (['case', ['==', ['get', 'territorio'], territorio], 2.5, 0.8] as ExpressionSpecification),
    );
  }

  enfocar(coleccion: ManzanasCollection, territorio?: number): void {
    const caja = territorio === undefined ? limitesPrincipales(coleccion) : limites(coleccion, territorio);
    if (caja) this.map.fitBounds(caja, { padding: 60, maxZoom: 18, duration: 500 });
  }

  enfocarManzana(feature: ManzanaFeature): void {
    const caja = limites({ type: 'FeatureCollection', features: [feature] });
    if (caja) this.map.fitBounds(caja, { padding: 120, maxZoom: 18.5, duration: 500 });
  }

  setFondo(fondo: FondoMapa): void {
    this.fondo = fondo;
    cambiarFondo(this.map, fondo, temaOscuro());
  }

  /** Empieza a dibujar un polígono nuevo (clic por vértice, clic en el primero para cerrar). */
  dibujarNuevo(): void {
    this.cancelarDibujo();
    this.draw?.setMode('polygon');
  }

  /** Pasa una manzana existente a terra-draw para mover, agregar o borrar vértices. */
  editarVertices(feature: ManzanaFeature): boolean {
    if (!this.draw || feature.geometry.type !== 'Polygon') return false;
    this.cancelarDibujo();
    const id = this.draw.getFeatureId();
    const resultado = this.draw.addFeatures([
      {
        id,
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates.map(a => a.map(p => [p[0], p[1]])) },
        properties: { mode: 'polygon' },
      },
    ]);
    if (!resultado[0]?.valid) return false;
    this.idDibujo = id;
    this.ocultar(feature.id);
    this.draw.setMode('select');
    this.draw.selectFeature(id);
    return true;
  }

  /** Oculta la manzana original mientras se redibuja o se editan sus vértices. */
  ocultar(id: number | null): void {
    const filtro: FilterSpecification | null = id === null ? null : ['!=', ['id'], id];
    for (const capa of ['manzanas-fill', 'manzanas-line', 'manzanas-sel', 'manzanas-invalidas', 'manzanas-nombres']) {
      const base = capa === 'manzanas-invalidas' ? (['==', ['get', 'valida'], false] as FilterSpecification) : null;
      const combinado = filtro && base ? ['all', base, filtro] : (filtro ?? base);
      this.map.setFilter(capa, combinado as FilterSpecification | null);
    }
  }

  /** Geometría del polígono dibujado o editado, o null si no hay ninguno terminado. */
  geometriaDibujada(): Polygon | null {
    if (this.idDibujo === null || !this.draw) return null;
    const f = this.draw.getSnapshotFeature(this.idDibujo);
    return f?.geometry.type === 'Polygon' ? (f.geometry as Polygon) : null;
  }

  hayDibujo(): boolean {
    return this.idDibujo !== null;
  }

  cancelarDibujo(): void {
    this.idDibujo = null;
    if (this.draw) {
      this.draw.clear();
      this.draw.setMode('static');
    }
    this.ocultar(null);
    this.map.getCanvas().style.cursor = '';
  }

  destruir(): void {
    this.observadorTema.disconnect();
    try {
      this.draw?.stop();
    } catch {
      // El mapa puede estar ya desmontado.
    }
    this.map.remove();
  }

  /**
   * Pega el vértice al de una manzana vecina si está a menos de
   * {@link TOLERANCIA_SNAP_PX}: así las manzanas nuevas comparten bordes
   * exactos con las existentes y no quedan huecos ni solapes finitos.
   */
  private snap(evento: TerraDrawMouseEvent, ctx: SnappableContext): Position | undefined {
    const borde = ctx.unproject(evento.containerX + TOLERANCIA_SNAP_PX, evento.containerY + TOLERANCIA_SNAP_PX);
    const dx = Math.abs(borde.lng - evento.lng);
    const dy = Math.abs(borde.lat - evento.lat);
    let mejor: Position | undefined;
    let mejorDist = TOLERANCIA_SNAP_PX ** 2;
    for (const v of this.vertices) {
      if (Math.abs(v[0] - evento.lng) > dx || Math.abs(v[1] - evento.lat) > dy) continue;
      const p = ctx.project(v[0], v[1]);
      const d = (p.x - evento.containerX) ** 2 + (p.y - evento.containerY) ** 2;
      if (d < mejorDist) {
        mejorDist = d;
        mejor = [v[0], v[1]];
      }
    }
    return mejor;
  }
}
