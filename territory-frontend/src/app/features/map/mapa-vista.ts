import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import { cambiarFondo, crearMapa, temaOscuro, type FondoMapa, type MapLibre } from '../../core/map/base-map';
import { franjaDeLados, type GeometriaManzana } from './utils/lados';
import { puntoInterior } from '../../core/map/geometria';
import type { EdicionLados } from './mapa.types';
import { UbicacionMapa, type ErrorUbicacion, type EstadoUbicacion } from './ubicacion';

export type { EstadoUbicacion };

/** Lo que el mapa necesita de cada manzana. El índice en la lista es su id en MapLibre. */
export interface ManzanaVista {
  id: string;
  territorio: number;
  color: string;
  geometria: GeometriaManzana;
}

/** Estado a dibujar; el mapa aplica solo las diferencias con el anterior. */
export interface EstadoVista {
  abiertos: number[];
  /** Manzanas pintadas como predicadas: las de la salida en los abiertos, la vuelta en curso en el resto. */
  marcadas: Set<string>;
  zonas: FeatureCollection<GeometriaManzana, { territorio: number; color: string }>;
  editando: string | null;
}

export interface Toque {
  /** Manzana bajo el dedo. */
  manzana: string | null;
  /** Si no hay ninguna bajo el dedo: la más cercana (a unos 30 px), para tocar "en la calle". */
  cercana: string | null;
}


export interface EventosVista {
  alTocar(t: Toque): void;
  alTocarLado(indice: number): void;
  alCambiarUbicacion(e: EstadoUbicacion, error?: ErrorUbicacion): void;
}

const ESTADO = (clave: string): ExpressionSpecification => ['boolean', ['feature-state', clave], false];
/** a: territorio abierto · m: marcada · d: atenuada (hay otro abierto) · e: se editan sus calles. */
const [ABIERTO, MARCADA, ATENUADA, EDITANDO] = ['a', 'm', 'd', 'e'].map(ESTADO);
const COLOR: ExpressionSpecification = ['get', 'color'];

const OPACIDAD_RELLENO: ExpressionSpecification = [
  'case',
  EDITANDO, 0.1,
  ['all', ABIERTO, MARCADA], 0.8,
  ABIERTO, 0.12,
  ['all', ATENUADA, MARCADA], 0.18,
  ATENUADA, 0.03,
  MARCADA, 0.55,
  0.1,
];

const TOQUE_CERCANO_PX = 30;
const CAPAS_UBICACION = ['ubicacion-precision', 'ubicacion-punto'];
const TOQUE_LADO_PX = 18;
const CAPTURA_MAX_PX = 1600;

/**
 * El mapa de marcado sobre MapLibre (WebGL). Solo dibuja y avisa de los
 * toques: qué significa un toque lo decide el `MapaStore`.
 */
export class MapaVista {
  private readonly indice = new Map<string, number>();
  private readonly porTerritorio = new Map<number, number[]>();
  private anterior = new Map<number, Record<string, boolean>>();
  private abiertosAntes = new Set<number>();
  private insignias: Marker[] = [];
  private pulso: Marker | null = null;
  /**
   * Lo que tapan la barra de arriba y el panel de abajo (px). La página mide
   * el panel real: con varios territorios abiertos crece, y encuadrar con un
   * margen fijo dejaba territorios debajo del panel, imposibles de tocar.
   */
  private margen = { arriba: 90, abajo: 300 };
  private ubicacion: UbicacionMapa | null = null;
  private fondo: FondoMapa = 'mapa';
  private observadorTema: MutationObserver | null = null;
  private capturando = false;

  private constructor(
    private readonly maplibre: MapLibre,
    readonly map: MapLibreMap,
    private readonly manzanas: ManzanaVista[],
    private readonly eventos: EventosVista,
  ) {
    manzanas.forEach((m, i) => {
      this.indice.set(m.id, i);
      const lista = this.porTerritorio.get(m.territorio) ?? [];
      lista.push(i);
      this.porTerritorio.set(m.territorio, lista);
    });
  }

  static async crear(
    contenedor: HTMLElement,
    manzanas: ManzanaVista[],
    etiquetas: FeatureCollection<Point, { territorio: number; etiqueta: string }>,
    fondo: FondoMapa,
    eventos: EventosVista,
  ): Promise<MapaVista> {
    const { maplibre, map } = await crearMapa(contenedor, fondo);
    const vista = new MapaVista(maplibre, map, manzanas, eventos);
    vista.fondo = fondo;
    vista.agregarCapas(etiquetas);
    vista.agregarUbicacion();
    map.on('click', e => vista.alHacerClick(e));
    vista.observadorTema = new MutationObserver(() => cambiarFondo(map, vista.fondo, temaOscuro()));
    vista.observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return vista;
  }

  destruir(): void {
    this.pulso?.remove();
    this.observadorTema?.disconnect();
    this.ubicacion?.apagar();
    this.quitarInsignias();
    this.map.remove();
  }

  // ── Capas ──

  private agregarCapas(etiquetas: FeatureCollection<Point, { territorio: number; etiqueta: string }>): void {
    const map = this.map;
    map.addSource('manzanas', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: this.manzanas.map((m, i) => ({
          type: 'Feature',
          id: i,
          geometry: m.geometria,
          properties: { territorio: m.territorio, color: m.color },
        })),
      },
    });
    map.addSource('zonas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('etiquetas', {
      type: 'geojson',
      data: { ...etiquetas, features: etiquetas.features.map(f => ({ ...f, id: f.properties.territorio })) },
    });
    map.addSource('lados', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('franja', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    map.addLayer({ id: 'manzanas-relleno', type: 'fill', source: 'manzanas', paint: { 'fill-color': COLOR, 'fill-opacity': OPACIDAD_RELLENO } });
    map.addLayer({
      id: 'zonas-relleno',
      type: 'fill',
      source: 'zonas',
      paint: { 'fill-color': COLOR, 'fill-opacity': ['case', ['get', 'atenuada'], 0.18, 0.8] },
    });
    map.addLayer({
      id: 'manzanas-borde',
      type: 'line',
      source: 'manzanas',
      paint: {
        'line-color': COLOR,
        'line-width': ['case', EDITANDO, 3, ABIERTO, 2.2, ATENUADA, 0.8, 1.3],
        'line-opacity': ['case', ATENUADA, 0.35, 1],
      },
    });
    map.addLayer({
      id: 'manzana-editando',
      type: 'line',
      source: 'manzanas',
      paint: { 'line-color': '#facc15', 'line-width': 4, 'line-opacity': ['case', EDITANDO, 1, 0] },
    });
    map.addLayer({ id: 'franja', type: 'fill', source: 'franja', paint: { 'fill-color': COLOR, 'fill-opacity': 0.8 } });
    map.addLayer({
      id: 'lados-borde',
      type: 'line',
      source: 'lados',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#111827', 'line-opacity': 0.75, 'line-width': ['case', ['get', 'marcado'], 11, 9] },
    });
    map.addLayer({
      id: 'lados-linea',
      type: 'line',
      source: 'lados',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['case', ['get', 'marcado'], COLOR, '#ffffff'], 'line-width': ['case', ['get', 'marcado'], 7, 5] },
    });
    map.addLayer({
      id: 'lados-linea-libre',
      type: 'line',
      source: 'lados',
      filter: ['!', ['get', 'marcado']],
      paint: { 'line-color': '#111827', 'line-width': 5, 'line-dasharray': [0, 1.6, 1.4] },
    });

    this.agregarImagenPildora();
    map.addLayer({
      id: 'etiquetas',
      type: 'symbol',
      source: 'etiquetas',
      layout: {
        'text-field': ['get', 'etiqueta'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 14,
        'icon-image': 'pildora',
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [3, 7, 3, 7],
        
        'text-padding': 4,
      },
      paint: {
        'text-color': '#111827',
        'text-opacity': ['case', ATENUADA, 0.45, 1],
        'icon-opacity': ['case', ATENUADA, 0.45, 1],
      },
    });
  }

  /** Fondo blanco redondeado estirable para los números de territorio. */
  private agregarImagenPildora(): void {
    const r = 2;
    const [w, h] = [24 * r, 24 * r];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(17,24,39,0.25)';
    ctx.lineWidth = r;
    ctx.beginPath();
    ctx.roundRect(r, r, w - 2 * r, h - 2 * r, 10 * r);
    ctx.fill();
    ctx.stroke();
    this.map.addImage('pildora', ctx.getImageData(0, 0, w, h), {
      pixelRatio: r,
      stretchX: [[10 * r, 14 * r]],
      stretchY: [[10 * r, 14 * r]],
      content: [6 * r, 6 * r, 18 * r, 18 * r],
    });
  }

  // ── Estado ──

  /** Aplica el estado como feature-state: marcar una manzana no vuelve a subir la geometría. */
  mostrar(e: EstadoVista): void {
    const abiertos = new Set(e.abiertos);
    const hayAbiertos = abiertos.size > 0;
    const nuevo = new Map<number, Record<string, boolean>>();
    this.manzanas.forEach((m, i) => {
      const a = abiertos.has(m.territorio);
      const estado = { a, m: e.marcadas.has(m.id), d: hayAbiertos && !a, e: e.editando === m.id };
      const previo = this.anterior.get(i);
      if (!previo || previo['a'] !== estado.a || previo['m'] !== estado.m || previo['d'] !== estado.d || previo['e'] !== estado.e) {
        this.map.setFeatureState({ source: 'manzanas', id: i }, estado);
      }
      nuevo.set(i, estado);
    });
    this.anterior = nuevo;

    void (this.map.getSource('zonas') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: e.zonas.features.map(f => ({
        ...f,
        properties: { ...f.properties, atenuada: hayAbiertos && !abiertos.has(f.properties.territorio) },
      })),
    });

    for (const t of new Set([...this.abiertosAntes, ...abiertos, ...this.porTerritorio.keys()])) {
      this.map.setFeatureState({ source: 'etiquetas', id: t }, { a: abiertos.has(t), d: hayAbiertos && !abiertos.has(t) });
    }
    this.abiertosAntes = abiertos;
  }

  // ── Cámara ──

  limites(territorios: number[]): LngLatBoundsLike | null {
    let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const t of territorios) {
      for (const i of this.porTerritorio.get(t) ?? []) {
        for (const [x, y] of coordenadas(this.manzanas[i].geometria)) {
          o = Math.min(o, x);
          e = Math.max(e, x);
          s = Math.min(s, y);
          n = Math.max(n, y);
        }
      }
    }
    return Number.isFinite(o) ? [[o, s], [e, n]] : null;
  }

  ajustarMargenes(m: { arriba?: number; abajo?: number }): void {
    this.margen = { ...this.margen, ...m };
  }

  /** Relleno para fitBounds que deja libre lo tapado, sin pasarse si la pantalla es chica. */
  private relleno(lados: number): { top: number; bottom: number; left: number; right: number } {
    const alto = this.map.getContainer().clientHeight;
    const arriba = Math.round(this.margen.arriba + 12);
    // Siempre queda al menos un 25 % del alto para el mapa.
    const abajo = Math.round(Math.max(24, Math.min(this.margen.abajo + 12, alto * 0.75 - arriba)));
    return { top: arriba, bottom: abajo, left: lados, right: lados };
  }

  /** Encuadra los territorios en lo que queda visible entre la barra y el panel. */
  encuadrar(territorios: number[], animar = true): void {
    const caja = this.limites(territorios);
    if (!caja) return;
    this.ubicacion?.dejarDeSeguir();
    this.map.fitBounds(caja, { padding: this.relleno(24), maxZoom: 17.5, duration: animar ? 600 : 0 });
  }

  encuadrarManzana(id: string): void {
    const i = this.indice.get(id);
    if (i === undefined) return;
    this.ubicacion?.dejarDeSeguir();
    this.map.fitBounds(this.cajaDe(this.manzanas[i].geometria), { padding: this.relleno(48), maxZoom: 18.5, duration: 600 });
  }

  centro(): [number, number] {
    const c = this.map.getCenter();
    return [c.lng, c.lat];
  }

  /** Aro que late sobre la manzana a tocar en la práctica del tutorial (null lo quita). */
  resaltarManzana(id: string | null): void {
    this.pulso?.remove();
    this.pulso = null;
    const i = id === null ? undefined : this.indice.get(id);
    if (i === undefined) return;
    const el = document.createElement('div');
    el.className = 'pulso-practica';
    el.setAttribute('aria-hidden', 'true');
    // MapLibre ubica el marcador con `transform`: la animación va en un hijo.
    el.appendChild(document.createElement('span'));
    this.pulso = new this.maplibre.Marker({ element: el })
      .setLngLat(puntoInterior(this.manzanas[i].geometria) as [number, number])
      .addTo(this.map);
  }

  encuadrarTodo(caja: LngLatBoundsLike): void {
    this.map.fitBounds(caja, { padding: 24, duration: 0 });
  }

  // ── Calles de una manzana ──

  /** Muestra (o quita, con null) los lados tocables de la manzana abierta y la vista previa. */
  mostrarLados(ed: EdicionLados | null, encuadrar = false): void {
    this.quitarInsignias();
    const lados = this.map.getSource('lados') as GeoJSONSource;
    const franja = this.map.getSource('franja') as GeoJSONSource;
    if (!ed) {
      void lados.setData({ type: 'FeatureCollection', features: [] });
      void franja.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const elegidos = new Set(ed.seleccion);
    const features: Feature<LineString, { indice: number; marcado: boolean; color: string }>[] = ed.lados.map(l => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: l.puntos },
      properties: { indice: l.indice, marcado: elegidos.has(l.indice), color: ed.color },
    }));
    void lados.setData({ type: 'FeatureCollection', features });
    const geometria = franjaDeLados(ed.geometria, ed.seleccion);
    void franja.setData({
      type: 'FeatureCollection',
      features: geometria ? [{ type: 'Feature', geometry: geometria, properties: { color: ed.color } }] : [],
    });

    for (const l of ed.lados) {
      const el = document.createElement('button');
      el.type = 'button';
      const bloqueado = ed.bloqueados.includes(l.indice);
      el.className = `lado-badge${elegidos.has(l.indice) ? ' marcado' : ''}${bloqueado ? ' bloqueado' : ''}`;
      el.textContent = elegidos.has(l.indice) ? '✓' : String(l.indice + 1);
      el.setAttribute(
        'aria-label',
        `Calle ${l.indice + 1}${bloqueado ? ', ya reportada' : elegidos.has(l.indice) ? ', predicada' : ''}`,
      );
      // Que el toque no llegue al mapa (abriría otra manzana).
      for (const tipo of ['mousedown', 'touchstart', 'pointerdown', 'dblclick']) {
        el.addEventListener(tipo, ev => ev.stopPropagation());
      }
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        this.eventos.alTocarLado(l.indice);
      });
      this.insignias.push(new this.maplibre.Marker({ element: el }).setLngLat(puntoMedio(l.puntos) as [number, number]).addTo(this.map));
    }

    if (encuadrar) {
      this.ubicacion?.dejarDeSeguir();
      this.map.fitBounds(this.cajaDe(ed.geometria), { padding: this.relleno(44), maxZoom: 19, duration: 500 });
    }
  }

  private quitarInsignias(): void {
    for (const m of this.insignias) m.remove();
    this.insignias = [];
  }

  private cajaDe(g: GeometriaManzana): LngLatBoundsLike {
    const pts = coordenadas(g);
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  }

  // ── Toques ──

  private alHacerClick(e: MapMouseEvent): void {
    if (this.capturando) return;
    const caja = (px: number): [[number, number], [number, number]] => [
      [e.point.x - px, e.point.y - px],
      [e.point.x + px, e.point.y + px],
    ];
    const lado = this.map.queryRenderedFeatures(caja(TOQUE_LADO_PX), { layers: ['lados-borde'] })[0];
    if (lado) {
      this.eventos.alTocarLado(Number(lado.properties['indice']));
      return;
    }
    const bajo = this.map.queryRenderedFeatures(e.point, { layers: ['manzanas-relleno'] });
    const manzana = bajo.length ? this.manzanas[Number(bajo[0].id)]?.id ?? null : null;
    let cercana: string | null = null;
    if (!manzana) {
      let mejor = Infinity;
      for (const f of this.map.queryRenderedFeatures(caja(TOQUE_CERCANO_PX), { layers: ['manzanas-relleno'] })) {
        const m = this.manzanas[Number(f.id)];
        if (!m) continue;
        const d = this.distanciaPx(e.point, m.geometria);
        if (d < mejor) {
          mejor = d;
          cercana = m.id;
        }
      }
    }
    this.eventos.alTocar({ manzana, cercana });
  }

  /** Distancia en pantalla del punto al borde más cercano de la manzana. */
  private distanciaPx(p: { x: number; y: number }, g: GeometriaManzana): number {
    const pts = coordenadas(g).map(c => this.map.project(c as [number, number]));
    let min = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      min = Math.min(min, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return min;
  }

  // ── Fondo y ubicación ──

  cambiarFondo(fondo: FondoMapa): void {
    this.fondo = fondo;
    cambiarFondo(this.map, fondo, temaOscuro());
  }

  private agregarUbicacion(): void {
    this.ubicacion = new UbicacionMapa(
      this.map,
      typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
      (e, error) => this.eventos.alCambiarUbicacion(e, error),
    );
  }

  alternarUbicacion(): void {
    this.ubicacion?.alternar();
  }

  // ── Captura para WhatsApp ──

  /**
   * Imagen (JPEG base64, sin prefijo) de los territorios del reporte: se
   * ocultan los demás, se encuadran esos y se vuelve a como estaba.
   */
  async capturar(territorios: number[]): Promise<string | null> {
    const map = this.map;
    const camara = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    const soloEstos: ExpressionSpecification = ['in', ['get', 'territorio'], ['literal', territorios]];
    const capas = ['manzanas-relleno', 'manzanas-borde', 'zonas-relleno', 'etiquetas'];
    this.capturando = true;
    try {
      this.mostrarLados(null);
      for (const c of capas) map.setFilter(c, soloEstos);
      // El punto azul no va en la imagen: diría dónde está el hermano.
      for (const c of CAPAS_UBICACION) map.setLayoutProperty(c, 'visibility', 'none');
      const caja = this.limites(territorios);
      if (caja) map.fitBounds(caja, { padding: 40, duration: 0, maxZoom: 18 });
      await this.esperarQuieto();
      return reducir(map.getCanvas());
    } catch {
      return null;
    } finally {
      for (const c of capas) map.setFilter(c, null);
      for (const c of CAPAS_UBICACION) map.setLayoutProperty(c, 'visibility', 'visible');
      map.jumpTo(camara);
      this.capturando = false;
    }
  }

  /** Espera a que terminen de cargar las teselas y se dibuje todo (máx. 8 s). */
  private esperarQuieto(): Promise<void> {
    return new Promise(resolve => {
      const listo = () => {
        clearTimeout(t);
        resolve();
      };
      const t = setTimeout(() => {
        this.map.off('idle', listo);
        resolve();
      }, 8000);
      this.map.once('idle', listo);
      this.map.triggerRepaint();
    });
  }
}

function coordenadas(g: GeometriaManzana): Position[] {
  return g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates.flat(2);
}

/** Punto a mitad del recorrido del lado (por largo), para su insignia. */
function puntoMedio(puntos: Position[]): Position {
  const largos = puntos.slice(1).map((p, i) => Math.hypot(p[0] - puntos[i][0], p[1] - puntos[i][1]));
  let resto = largos.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < largos.length; i++) {
    if (resto <= largos[i] && largos[i] > 0) {
      const t = resto / largos[i];
      return [puntos[i][0] + (puntos[i + 1][0] - puntos[i][0]) * t, puntos[i][1] + (puntos[i + 1][1] - puntos[i][1]) * t];
    }
    resto -= largos[i];
  }
  return puntos[0];
}

/** JPEG del canvas del mapa, achicado si es muy grande (pantallas de alta densidad). */
function reducir(origen: HTMLCanvasElement): string | null {
  const escala = Math.min(1, CAPTURA_MAX_PX / Math.max(origen.width, origen.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(origen.width * escala);
  canvas.height = Math.round(origen.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(origen, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? null;
}
