import type { EstadoTerritorioAdmin, ManzanaFeature } from '../admin.models';
import { estadoDesde, situacion, type EstadoCorreccion, type Situacion } from './correccion';

/**
 * Tarjeta de un territorio para imprimir: para los hermanos que trabajan en
 * papel. Funciones puras.
 */

/** "72, 61 85-87" → [72, 61, 85, 86, 87] (solo los que existen, sin repetir, en ese orden). */
export function leerTerritorios(texto: string, existentes: number[]): number[] {
  const hay = new Set(existentes);
  const vistos = new Set<number>();
  const lista: number[] = [];
  for (const parte of texto.split(/[\s,;]+/).filter(Boolean)) {
    const rango = parte.match(/^(\d+)\s*-\s*(\d+)$/);
    const numeros = rango
      ? Array.from({ length: Math.min(200, Math.abs(Number(rango[2]) - Number(rango[1])) + 1) }, (_, i) =>
          Math.min(Number(rango[1]), Number(rango[2])) + i,
        )
      : /^\d+$/.test(parte)
        ? [Number(parte)]
        : [];
    for (const n of numeros) {
      if (hay.has(n) && !vistos.has(n)) {
        vistos.add(n);
        lista.push(n);
      }
    }
  }
  return lista;
}

export interface FilaTarjeta {
  nombre: string;
  situacion: Situacion;
}

export interface Tarjeta {
  numero: number;
  color: string;
  filas: FilaTarjeta[];
  /** Cuántas manzanas ya están predicadas en esta vuelta (enteras). */
  predicadas: number;
  ultimoReporte: string | null;
  completo: boolean;
  /** Lo ya predicado, para pintarlo en el mapa de la tarjeta. */
  marcado: EstadoCorreccion;
}

/** Las manzanas del territorio con cómo van en la vuelta actual (si estaba completo, todo empieza de cero). */
export function tarjetaDe(
  numero: number,
  manzanas: ManzanaFeature[],
  estado: EstadoTerritorioAdmin | null,
  color: string,
): Tarjeta {
  const completo = estado?.estado === 'completed';
  const vigente = completo ? null : estado;
  const e = estadoDesde(vigente, manzanas);
  const filas = [...manzanas]
    .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es', { numeric: true }))
    .map(m => ({ nombre: m.properties.nombre, situacion: situacion(e, m) }));
  return {
    numero,
    color,
    filas,
    predicadas: filas.filter(f => f.situacion === 'entera').length,
    ultimoReporte: estado?.fecha ?? null,
    completo,
    marcado: e,
  };
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Documento HTML para imprimir (una hoja por territorio). Se imprime desde un
 * marco aparte para que la impresión no arrastre el panel.
 */
export function documentoParaImprimir(tarjetas: Tarjeta[], imagenes: Map<number, string | null>, hoy: string): string {
  const hojas = tarjetas
    .map(t => {
      const img = imagenes.get(t.numero);
      const filas = t.filas
        .map(
          f =>
            `<li><span class="casilla">${f.situacion === 'entera' ? '✓' : f.situacion === 'calles' ? '½' : ''}</span>${escapar(f.nombre)}` +
            `${f.situacion === 'calles' ? ' <small>(algunas calles)</small>' : ''}</li>`,
        )
        .join('');
      return `<section class="hoja">
  <header><h1><span class="color" style="background:${escapar(t.color)}"></span>Territorio ${t.numero}</h1>
  <p>${t.filas.length} manzanas · ${t.completo ? 'Vuelta nueva' : `${t.predicadas} ya predicadas`} · impreso el ${escapar(hoy)}</p></header>
  ${img ? `<img src="data:image/jpeg;base64,${img}" alt="Mapa del territorio ${t.numero}">` : '<p class="sin-mapa">(sin mapa)</p>'}
  <h2>Manzanas <small>✓ predicada · ½ algunas calles · vacía: falta</small></h2>
  <ul>${filas}</ul>
  <footer>Encargado: ______________________ &nbsp; Fecha: ____________ &nbsp; ☐ Completado</footer>
</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tarjetas de territorio</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { page-break-after: always; break-after: page; }
  .hoja:last-child { page-break-after: auto; break-after: auto; }
  header h1 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 28px; }
  header p { margin: 4px 0 10px; color: #444; font-size: 13px; }
  .color { width: 18px; height: 18px; border-radius: 4px; display: inline-block; }
  img { width: 100%; max-height: 150mm; object-fit: contain; border: 1px solid #999; border-radius: 4px; }
  .sin-mapa { color: #777; }
  h2 { font-size: 15px; margin: 12px 0 6px; }
  h2 small { font-weight: normal; color: #555; font-size: 12px; margin-left: 8px; }
  ul { list-style: none; padding: 0; margin: 0; columns: 3; column-gap: 18px; font-size: 14px; }
  li { display: flex; align-items: center; gap: 8px; padding: 3px 0; break-inside: avoid; }
  li small { color: #555; }
  .casilla { width: 16px; height: 16px; border: 1.5px solid #222; border-radius: 3px; display: inline-grid; place-items: center; font-size: 12px; flex: none; }
  footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #bbb; font-size: 13px; }
</style></head><body>
${hojas}
</body></html>`;
}
