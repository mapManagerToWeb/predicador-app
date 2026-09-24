type Celda = string | number | null | undefined;

/**
 * CSV para abrir directo en Excel con configuración regional de Chile:
 * separador ';' (la coma es el separador decimal), BOM para que respete
 * tildes y eñes, y CRLF.
 */
export function aCsv(encabezados: string[], filas: Celda[][]): string {
  const linea = (celdas: Celda[]) => celdas.map(escapar).join(';');
  return '﻿' + [linea(encabezados), ...filas.map(linea)].join('\r\n') + '\r\n';
}

function escapar(celda: Celda): string {
  if (celda === null || celda === undefined) return '';
  let texto = typeof celda === 'number' ? String(celda).replace('.', ',') : celda;
  // Evita que Excel interprete una celda como fórmula (inyección CSV).
  if (/^[=+\-@]/.test(texto) && typeof celda === 'string') texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Descarga un archivo generado en el navegador. */
export function descargar(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
