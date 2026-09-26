import { strToU8, zipSync } from 'fflate';
import type { AsignacionS13, FilaS13, PaginaS13 } from './s13';

/**
 * Genera el S-13-S ("Registro de asignación de territorio") como .docx con la
 * misma forma que el formulario oficial: A4, 20 territorios por página, dos
 * filas por territorio (a quién se asignó / fechas) y 4 asignaciones.
 * Se arma el XML a mano (WordprocessingML) para no cargar una librería de
 * documentos: solo hace falta empaquetarlo en un zip.
 */

// Medidas en twips (1/20 de punto), tomadas del formulario oficial.
const ANCHOS = [709, 1276, 1067, 1067, 1067, 1068, 1067, 1067, 1067, 1068];
const ANCHO_TABLA = ANCHOS.reduce((a, b) => a + b, 0);
/** Alto fijo de cada fila: 20 territorios (40 filas) entran en una hoja A4. */
const ALTO_FILA = 318;
const GRIS = 'D9D9D9';
const TEXTO_GRIS = '404040';

type Borde = { top?: number; left?: number; bottom?: number; right?: number };

function esc(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bordes(b: Borde): string {
  const lado = (nombre: string, sz?: number) =>
    sz === undefined ? '' : `<w:${nombre} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`;
  return `<w:tcBorders>${lado('top', b.top)}${lado('left', b.left)}${lado('bottom', b.bottom)}${lado('right', b.right)}</w:tcBorders>`;
}

interface Celda {
  texto?: string;
  ancho: number;
  span?: number;
  vMerge?: 'restart' | 'continue';
  borde: Borde;
  gris?: boolean;
  tam?: number;
  centrado?: boolean;
  negrita?: boolean;
}

function celda(c: Celda): string {
  const tam = c.tam ?? 20;
  const color = c.gris ? `<w:color w:val="${TEXTO_GRIS}"/>` : '';
  const rPr = `<w:rPr>${c.negrita ? '<w:b/>' : ''}${color}<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/></w:rPr>`;
  const run = c.texto ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(c.texto)}</w:t></w:r>` : '';
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${c.ancho}" w:type="dxa"/>` +
    (c.span ? `<w:gridSpan w:val="${c.span}"/>` : '') +
    (c.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : c.vMerge === 'continue' ? '<w:vMerge/>' : '') +
    bordes(c.borde) +
    (c.gris ? `<w:shd w:val="clear" w:color="auto" w:fill="${GRIS}"/>` : '') +
    '<w:tcMar><w:left w:w="45" w:type="dxa"/><w:right w:w="45" w:type="dxa"/></w:tcMar>' +
    '<w:vAlign w:val="center"/></w:tcPr>' +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${c.centrado === false ? 'left' : 'center'}"/>${rPr}</w:pPr>${run}</w:p></w:tc>`
  );
}

function fila(celdas: Celda[], alto?: number): string {
  const trPr = alto ? `<w:trPr><w:cantSplit/><w:trHeight w:val="${alto}" w:hRule="exact"/></w:trPr>` : '<w:trPr><w:cantSplit/></w:trPr>';
  return `<w:tr>${trPr}${celdas.map(celda).join('')}</w:tr>`;
}

/** Borde izquierdo de cada bloque "Asignado a": grueso el primero, medio los demás. */
const izquierdaBloque = (i: number) => (i === 0 ? 24 : 12);

function encabezado(): string {
  const r1: Celda[] = [
    { texto: 'Núm. de terr.', ancho: ANCHOS[0], vMerge: 'restart', borde: { top: 24, left: 24, right: 4 }, gris: true, tam: 18 },
    { texto: 'Última fecha en que se completó*', ancho: ANCHOS[1], vMerge: 'restart', borde: { top: 24, left: 4, right: 24 }, gris: true, tam: 18 },
  ];
  const r2: Celda[] = [
    { ancho: ANCHOS[0], vMerge: 'continue', borde: { left: 24, right: 4 }, gris: true },
    { ancho: ANCHOS[1], vMerge: 'continue', borde: { left: 4, right: 24 }, gris: true },
  ];
  for (let i = 0; i < 4; i++) {
    const derecha = i === 3 ? 24 : 12;
    r1.push({ texto: 'Asignado a', ancho: ANCHOS[2 + 2 * i] + ANCHOS[3 + 2 * i], span: 2, borde: { top: 24, left: izquierdaBloque(i), bottom: 4, right: derecha }, gris: true, tam: 18 });
    r2.push({ texto: 'Fecha en que se asignó', ancho: ANCHOS[2 + 2 * i], borde: { top: 4, left: izquierdaBloque(i), bottom: 12, right: 4 }, gris: true, tam: 16 });
    r2.push({ texto: 'Fecha en que se completó', ancho: ANCHOS[3 + 2 * i], borde: { top: 4, left: 4, bottom: 12, right: derecha }, gris: true, tam: 16 });
  }
  return fila(r1) + fila(r2);
}

function fechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fechaLarga(d: Date): string {
  return `${fechaCorta(d)}-${String(d.getFullYear()).slice(-2)}`;
}

function filasTerritorio(f: FilaS13, ultima: boolean): string {
  const abajo = ultima ? 24 : undefined;
  const nombres: Celda[] = [
    { texto: String(f.territorio), ancho: ANCHOS[0], vMerge: 'restart', borde: { top: 12, left: 24, right: 4 }, tam: 22 },
    { texto: f.ultimaCompletada ? fechaLarga(f.ultimaCompletada) : '', ancho: ANCHOS[1], vMerge: 'restart', borde: { top: 12, left: 4, right: 24 }, tam: 20 },
  ];
  const fechas: Celda[] = [
    { ancho: ANCHOS[0], vMerge: 'continue', borde: { left: 24, right: 4, bottom: abajo } },
    { ancho: ANCHOS[1], vMerge: 'continue', borde: { left: 4, right: 24, bottom: abajo } },
  ];
  f.asignaciones.forEach((a: AsignacionS13 | null, i) => {
    const derecha = i === 3 ? 24 : 12;
    nombres.push({
      texto: a?.encargado ?? '',
      ancho: ANCHOS[2 + 2 * i] + ANCHOS[3 + 2 * i],
      span: 2,
      borde: { top: 12, left: izquierdaBloque(i), bottom: 4, right: derecha },
      tam: 18,
    });
    fechas.push({ texto: a ? fechaCorta(a.asignado) : '', ancho: ANCHOS[2 + 2 * i], borde: { top: 4, left: izquierdaBloque(i), right: 4, bottom: abajo }, tam: 18 });
    fechas.push({
      texto: a?.completado ? fechaCorta(a.completado) : '',
      ancho: ANCHOS[3 + 2 * i],
      borde: { top: 4, left: 4, right: derecha, bottom: abajo },
      tam: 18,
    });
  });
  return fila(nombres, ALTO_FILA) + fila(fechas, ALTO_FILA);
}

function pagina(p: PaginaS13, anio: string, saltoAntes: boolean): string {
  const salto = saltoAntes ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
  const titulo =
    '<w:p><w:pPr><w:spacing w:after="160"/><w:jc w:val="center"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>REGISTRO DE ASIGNACIÓN DE TERRITORIO</w:t></w:r></w:p>';
  const anioServicio =
    '<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="left"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Año de servicio:   </w:t></w:r>' +
    `<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">  ${esc(anio)}  </w:t></w:r></w:p>`;
  const grid = `<w:tblGrid>${ANCHOS.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const tabla =
    `<w:tbl><w:tblPr><w:tblW w:w="${ANCHO_TABLA}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:left w:w="45" w:type="dxa"/><w:right w:w="45" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    grid +
    encabezado() +
    p.filas.map((f, i) => filasTerritorio(f, i === p.filas.length - 1)).join('') +
    '</w:tbl>';
  const nota =
    '<w:p><w:pPr><w:spacing w:before="60" w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr>' +
    '<w:t>*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.</w:t></w:r></w:p>';
  return salto + titulo + anioServicio + tabla + nota;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** El .docx (bytes) del S-13 con esas páginas. `anio` va en "Año de servicio". */
export function documentoS13(paginas: PaginaS13[], anio: string): Uint8Array {
  const cuerpo = paginas.map((p, i) => pagina(p, anio, i > 0)).join('');
  const documento =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${cuerpo}` +
    '<w:sectPr><w:footerReference w:type="default" r:id="rId1"/>' +
    '<w:pgSz w:w="11907" w:h="16840"/><w:pgMar w:top="850" w:right="720" w:bottom="850" w:left="720" w:header="400" w:footer="400" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';
  const pie =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>` +
    '<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">S-13-S</w:t></w:r></w:p></w:ftr>';
  const estilos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults>` +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults></w:styles>';
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '</Types>';
  const relsRaiz =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const relsDocumento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  return zipSync({
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(relsRaiz),
    'word/document.xml': strToU8(documento),
    'word/styles.xml': strToU8(estilos),
    'word/footer1.xml': strToU8(pie),
    'word/_rels/document.xml.rels': strToU8(relsDocumento),
  });
}
