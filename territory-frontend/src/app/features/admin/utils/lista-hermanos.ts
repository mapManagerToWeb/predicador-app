/**
 * Lee una lista de hermanos pegada desde Excel, un CSV o escrita a mano: una
 * persona por línea. Acepta columnas separadas por tabulación, punto y coma o
 * coma («Nombre; Apellido; Teléfono» o «Nombre Apellido, Teléfono»), y
 * también una línea sin separadores con el teléfono al final
 * («Pedro Soto 9 1234 5678»). No valida: eso lo hace el servidor, que
 * explica cada fila.
 */
export interface FilaLista {
  nombre: string;
  apellido: string;
  telefono: string;
}

const SEPARADOR = /\t|;|,/;
/** Un teléfono escrito con espacios, guiones o +56 al final de la línea. */
const TELEFONO_AL_FINAL = /(\+?\s*56)?[\s-]*9(?:[\s-]*\d){8}\s*$/;

function digitos(texto: string): number {
  return texto.replace(/\D/g, '').length;
}

function esEncabezado(linea: string): boolean {
  return /nombre|apellido|tel[eé]fono|celular/i.test(linea) && digitos(linea) < 8;
}

/** "Pedro Soto Díaz" → Pedro / Soto Díaz. */
function separarNombre(texto: string): { nombre: string; apellido: string } {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  return { nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
}

export function leerLista(texto: string): FilaLista[] {
  const lineas = texto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lineas.length && esEncabezado(lineas[0])) lineas.shift();

  return lineas.map(linea => {
    const columnas = linea.split(SEPARADOR).map(c => c.trim()).filter(c => c.length > 0);
    if (columnas.length > 1) {
      // El teléfono es la columna con más dígitos (8 o más); el resto, el nombre.
      let iTel = -1;
      columnas.forEach((c, i) => {
        if (digitos(c) >= 8 && (iTel === -1 || digitos(c) >= digitos(columnas[iTel]))) iTel = i;
      });
      // Con tres columnas o más y ninguna con forma de teléfono, es la última (un número mal escrito).
      if (iTel === -1 && columnas.length >= 3) iTel = columnas.length - 1;
      const telefono = iTel >= 0 ? columnas[iTel] : '';
      const resto = columnas.filter((_, i) => i !== iTel);
      if (resto.length >= 2) return { nombre: resto[0], apellido: resto.slice(1).join(' '), telefono };
      return { ...separarNombre(resto[0] ?? ''), telefono };
    }
    const tel = linea.match(TELEFONO_AL_FINAL);
    const telefono = tel ? tel[0].trim() : '';
    const nombre = tel ? linea.slice(0, tel.index).trim() : linea;
    return { ...separarNombre(nombre), telefono };
  });
}
