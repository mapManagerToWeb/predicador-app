import type { LngLatBoundsLike, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { ManzanasCollection } from '../admin.models';

export type FondoMapa = 'mapa' | 'satelite';
export type MapLibre = typeof import('maplibre-gl');

/** Encuadre inicial si todavía no hay manzanas cargadas (Lebu). */
const ENCUADRE_INICIAL: LngLatBoundsLike = [
  [-73.45, -37.61],
  [-73.24, -37.38],
];

const FONDOS = {
  mapa: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satelite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '© Esri, Maxar, Earthstar Geographics',
  },
} as const;

/**
 * En tema oscuro se atenúa el mapa de OpenStreetMap en vez de usar las
 * teselas oscuras de CARTO, que ahora exigen API key (devuelven una marca de
 * agua "API KEY REQUIRED").
 */
const ATENUACION_OSCURA = { 'raster-brightness-max': 0.72, 'raster-saturation': -0.35, 'raster-contrast': 0.05 };

export function temaOscuro(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light';
}

export function estiloBase(fondo: FondoMapa, oscuro: boolean): StyleSpecification {
  const f = FONDOS[fondo];
  return {
    version: 8,
    // Fuentes para los rótulos de territorio (las teselas de fondo son imágenes).
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      fondo: { type: 'raster', tiles: [...f.tiles], tileSize: 256, maxzoom: 19, attribution: f.attribution },
    },
    layers: [{ id: 'fondo', type: 'raster', source: 'fondo', paint: pinturaFondo(fondo, oscuro) }],
  };
}

function pinturaFondo(fondo: FondoMapa, oscuro: boolean) {
  return fondo === 'mapa' && oscuro ? ATENUACION_OSCURA : {};
}

/** Cambia solo la capa de fondo, sin tocar las fuentes y capas propias. */
export function cambiarFondo(map: MapLibreMap, fondo: FondoMapa, oscuro: boolean): void {
  const estilo = estiloBase(fondo, oscuro);
  const primeraPropia = map.getStyle().layers.find(l => l.id !== 'fondo')?.id;
  if (map.getLayer('fondo')) map.removeLayer('fondo');
  if (map.getSource('fondo')) map.removeSource('fondo');
  map.addSource('fondo', estilo.sources['fondo']);
  map.addLayer({ id: 'fondo', type: 'raster', source: 'fondo', paint: pinturaFondo(fondo, oscuro) }, primeraPropia);
}

let cssCargado: Promise<void> | null = null;

/** La hoja de estilos de MapLibre (83 kB) solo se descarga cuando el panel abre un mapa. */
function cargarCss(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  cssCargado ??= new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'vendor/maplibre-gl.css';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return cssCargado;
}

export async function crearMapa(
  contenedor: HTMLElement,
  fondo: FondoMapa = 'mapa',
): Promise<{ maplibre: MapLibre; map: MapLibreMap }> {
  const [maplibre] = await Promise.all([import('maplibre-gl'), cargarCss()]);
  // MapLibre busca su worker junto a su propio módulo (import.meta.url), que
  // tras el bundling es un chunk en la raíz: se sirve aparte desde /vendor
  // (ver assets en angular.json) junto con el módulo compartido que importa.
  maplibre.setWorkerUrl(new URL('vendor/maplibre-gl-worker.mjs', document.baseURI).href);
  const map = new maplibre.Map({
    container: contenedor,
    style: estiloBase(fondo, temaOscuro()),
    bounds: ENCUADRE_INICIAL,
    attributionControl: { compact: true },
    // Guardar el canvas permite exportar la vista como imagen.
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left');
  await new Promise<void>(resolve => (map.loaded() ? resolve() : map.once('load', () => resolve())));
  return { maplibre, map };
}

/** Caja que contiene todas las manzanas (o las de un territorio). */
export function limites(coleccion: ManzanasCollection, territorio?: number): LngLatBoundsLike | null {
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  for (const f of coleccion.features) {
    if (territorio !== undefined && f.properties.territorio !== territorio) continue;
    const anillos = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (const anillo of anillos) {
      for (const [x, y] of anillo) {
        oeste = Math.min(oeste, x);
        este = Math.max(este, x);
        sur = Math.min(sur, y);
        norte = Math.max(norte, y);
      }
    }
  }
  return Number.isFinite(oeste) ? [[oeste, sur], [este, norte]] : null;
}

/**
 * Encuadre de la zona donde están casi todas las manzanas: descarta el 3 %
 * de cada extremo para que un par de manzanas rurales enormes no obliguen a
 * alejar tanto el mapa que la ciudad no se distinga.
 */
export function limitesPrincipales(coleccion: ManzanasCollection): LngLatBoundsLike | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const f of coleccion.features) {
    const caja = limites({ type: 'FeatureCollection', features: [f] }) as [[number, number], [number, number]] | null;
    if (!caja) continue;
    xs.push((caja[0][0] + caja[1][0]) / 2);
    ys.push((caja[0][1] + caja[1][1]) / 2);
  }
  if (xs.length < 10) return limites(coleccion);
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (v: number[], p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const [oeste, este, sur, norte] = [q(xs, 0.03), q(xs, 0.97), q(ys, 0.03), q(ys, 0.97)];
  const mx = (este - oeste) * 0.1;
  const my = (norte - sur) * 0.1;
  return [
    [oeste - mx, sur - my],
    [este + mx, norte + my],
  ];
}

/** Punto representativo (centro de la caja) de cada territorio, para rotularlo. */
export function etiquetasTerritorios(coleccion: ManzanasCollection): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const cajas = new Map<number, [number, number, number, number]>();
  for (const f of coleccion.features) {
    const t = f.properties.territorio;
    const caja = cajas.get(t) ?? [Infinity, Infinity, -Infinity, -Infinity];
    const anillos = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (const anillo of anillos) {
      for (const [x, y] of anillo) {
        caja[0] = Math.min(caja[0], x);
        caja[1] = Math.min(caja[1], y);
        caja[2] = Math.max(caja[2], x);
        caja[3] = Math.max(caja[3], y);
      }
    }
    cajas.set(t, caja);
  }
  return {
    type: 'FeatureCollection',
    features: [...cajas].map(([t, c]) => ({
      type: 'Feature',
      properties: { territorio: t, etiqueta: String(t) },
      geometry: { type: 'Point', coordinates: [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2] },
    })),
  };
}
