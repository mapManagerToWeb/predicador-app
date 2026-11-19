import type { ManzanaGeometry, ManzanasCollection } from '../admin.models';

/**
 * KML (el formato de Google Earth y QGIS) de las manzanas del panel.
 *
 * Se traduce en el navegador y no en el servidor: el importador sigue siendo
 * el mismo de GeoJSON, con sus mismas reglas (todo o nada), así que un KML
 * solo tiene que convertirse a FeatureCollection antes de mandarlo.
 */

const NAMESPACE = 'http://www.opengis.net/kml/2.2';
/** 7 decimales ≈ 1 cm: de sobra para dibujar una manzana. */
const DECIMALES = 7;
const MAX_ERRORES = 20;

/** Lo que el importador del backend entiende como manzana. */
interface ManzanaKml {
  type: 'Feature';
  properties: { territorio: number; nombre: string };
  geometry: ManzanaGeometry;
}

export interface ColeccionKml {
  type: 'FeatureCollection';
  features: ManzanaKml[];
}

/** FeatureCollection → KML, con `territorio` y `nombre` en ExtendedData. */
export function aKml(coleccion: ManzanasCollection): string {
  const placemarks = coleccion.features.map(
    f =>
      `    <Placemark>\n` +
      `      <name>${escapar(f.properties.nombre)}</name>\n` +
      `      <ExtendedData>\n` +
      `        <Data name="id"><value>${f.properties.id}</value></Data>\n` +
      `        <Data name="territorio"><value>${f.properties.territorio}</value></Data>\n` +
      `        <Data name="nombre"><value>${escapar(f.properties.nombre)}</value></Data>\n` +
      `      </ExtendedData>\n` +
      geometriaKml(f.geometry).join('\n') +
      `\n    </Placemark>`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="${NAMESPACE}">\n` +
    `  <Document>\n` +
    `    <name>Manzanas</name>\n` +
    `${placemarks.join('\n')}\n` +
    `  </Document>\n` +
    `</kml>\n`
  );
}

/**
 * KML → FeatureCollection, listo para el importador de manzanas.
 *
 * Cada Placemark necesita `territorio` en ExtendedData/Data o SchemaData/
 * SimpleData; el `nombre` puede venir de la misma forma o ser el nombre del
 * Placemark. Solo se aceptan polígonos. Si algo está mal no se devuelve nada,
 * igual que el importador del servidor.
 */
export function deKml(texto: string): ColeccionKml {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Este navegador no puede leer archivos KML');
  }
  if (/^\s*PK/.test(texto)) {
    throw new Error('El archivo es un KMZ comprimido: descomprimilo e importá el .kml de adentro');
  }
  const doc = new DOMParser().parseFromString(texto, 'text/xml');
  const raiz = doc.documentElement?.localName?.toLowerCase();
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length > 0 || raiz !== 'kml') {
    throw new Error('El archivo no es un KML válido');
  }

  const placemarks = Array.from(doc.getElementsByTagNameNS('*', 'Placemark'));
  if (placemarks.length === 0) {
    throw new Error('El archivo KML no tiene manzanas (Placemark)');
  }

  const errores: string[] = [];
  const features: ManzanaKml[] = [];
  placemarks.forEach((pm, i) => {
    const props = propiedades(pm);
    const nombre = (props.get('nombre') ?? props.get('nombre_bloque') ?? textoDe(hijo(pm, 'name'))).trim();
    const etiqueta = nombre || `Placemark ${i + 1}`;
    const crudo = (props.get('territorio') ?? props.get('territorio_padre') ?? '').trim();
    const territorio = Number(crudo);
    if (crudo === '' || !Number.isFinite(territorio)) {
      errores.push(`${etiqueta}: falta la propiedad "territorio" (número)`);
      return;
    }
    if (!nombre) {
      errores.push(`${etiqueta}: falta la propiedad "nombre"`);
      return;
    }
    const geometry = geometria(pm, etiqueta, errores);
    if (!geometry) return;
    features.push({ type: 'Feature', properties: { territorio, nombre }, geometry });
  });

  if (errores.length > 0) {
    const muestra = errores.slice(0, MAX_ERRORES).join(' | ');
    throw new Error(`No se importó nada. ${errores.length} error(es): ${muestra}`);
  }
  return { type: 'FeatureCollection', features };
}

function geometriaKml(geometria: ManzanaGeometry): string[] {
  const partes = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates;
  const poligonos = partes.map(anillos => polygonKml(anillos));
  return poligonos.length === 1 ? poligonos : ['      <MultiGeometry>', ...poligonos, '      </MultiGeometry>'];
}

function polygonKml(anillos: number[][][]): string {
  const [exterior, ...huecos] = anillos;
  const bloque = (etiqueta: string, anillo: number[][]) =>
    `        <${etiqueta}>\n` +
    `          <LinearRing>\n` +
    `            <coordinates>${anillo.map(([lon, lat]) => `${numero(lon)},${numero(lat)}`).join(' ')}</coordinates>\n` +
    `          </LinearRing>\n` +
    `        </${etiqueta}>`;
  return [
    '      <Polygon>',
    bloque('outerBoundaryIs', exterior),
    ...huecos.map(h => bloque('innerBoundaryIs', h)),
    '      </Polygon>',
  ].join('\n');
}

function numero(n: number): string {
  return String(Number(n.toFixed(DECIMALES)));
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Primer hijo con ese nombre (sin mirar dentro de otros elementos). */
function hijo(el: Element, nombre: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName?.toLowerCase() === nombre) return c;
  }
  return null;
}

function textoDe(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

/**
 * Propiedades del Placemark en minúsculas: `<Data name="x"><value>` (KML
 * estándar) y `<SimpleData name="x">` (QGIS). Data gana si están las dos.
 */
function propiedades(pm: Element): Map<string, string> {
  const props = new Map<string, string>();
  for (const simple of Array.from(pm.getElementsByTagNameNS('*', 'SimpleData'))) {
    const clave = simple.getAttribute('name')?.trim().toLowerCase();
    if (clave) props.set(clave, textoDe(simple));
  }
  for (const data of Array.from(pm.getElementsByTagNameNS('*', 'Data'))) {
    const clave = data.getAttribute('name')?.trim().toLowerCase();
    if (clave) props.set(clave, textoDe(hijo(data, 'value')) || textoDe(data));
  }
  return props;
}

function geometria(pm: Element, etiqueta: string, errores: string[]): ManzanaGeometry | null {
  const poligonos = Array.from(pm.getElementsByTagNameNS('*', 'Polygon'));
  if (poligonos.length === 0) {
    errores.push(`${etiqueta}: no es un polígono (solo se importan manzanas)`);
    return null;
  }
  const partes: number[][][][] = [];
  for (const poligono of poligonos) {
    const anillos = anillosDe(poligono, etiqueta, errores);
    if (!anillos) return null;
    partes.push(anillos);
  }
  return partes.length === 1
    ? { type: 'Polygon', coordinates: partes[0] }
    : { type: 'MultiPolygon', coordinates: partes };
}

function anillosDe(poligono: Element, etiqueta: string, errores: string[]): number[][][] | null {
  const limites = Array.from(poligono.children).filter(c => {
    const nombre = c.localName?.toLowerCase();
    return nombre === 'outerboundaryis' || nombre === 'innerboundaryis';
  });
  if (!limites.some(b => b.localName?.toLowerCase() === 'outerboundaryis')) {
    errores.push(`${etiqueta}: el polígono no tiene contorno exterior`);
    return null;
  }
  const anillos: number[][][] = [];
  for (const limite of limites) {
    const anillo = leerAnillo(limite, etiqueta, errores);
    if (!anillo) return null;
    anillos.push(anillo);
  }
  return anillos;
}

function leerAnillo(limite: Element, etiqueta: string, errores: string[]): number[][] | null {
  const crudas = textoDe(limite.getElementsByTagNameNS('*', 'coordinates')[0] ?? null)
    .split(/\s+/)
    .filter(Boolean);
  const puntos: number[][] = [];
  let invalidas = 0;
  for (const cruda of crudas) {
    const [lon, lat] = cruda.split(',');
    const x = Number(lon);
    const y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      invalidas++;
      continue;
    }
    puntos.push([x, y]);
  }
  if (crudas.length === 0) {
    errores.push(`${etiqueta}: el polígono no tiene coordenadas`);
    return null;
  }
  if (invalidas > 0) {
    errores.push(`${etiqueta}: coordenadas con formato inválido`);
    return null;
  }
  if (puntos.length < 3) {
    errores.push(`${etiqueta}: el polígono tiene menos de 3 puntos`);
    return null;
  }
  const [primero, ultimo] = [puntos[0], puntos[puntos.length - 1]];
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) puntos.push([...primero]);
  if (new Set(puntos.slice(0, -1).map(p => `${p[0]},${p[1]}`)).size < 3) {
    errores.push(`${etiqueta}: el polígono no tiene área`);
    return null;
  }
  return puntos;
}
