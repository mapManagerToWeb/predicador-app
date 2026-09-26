import type { GeometriaManzana, Lado } from './utils/lados';

/** Modo de marcado: la manzana entera con un toque, o eligiendo sus calles. */
export type ModoMarcado = 'manzana' | 'calles';

/** Manzana abierta para elegir qué calles (lados) se predicaron. */
export interface EdicionLados {
  manzanaId: string;
  nombre: string;
  territorio: number;
  color: string;
  geometria: GeometriaManzana;
  lados: Lado[];
  seleccion: number[];
}

/** Pregunta en pantalla (en vez de borrar o enviar sin avisar). */
export interface Pregunta {
  titulo: string;
  texto?: string;
  /** Líneas de detalle (p. ej. el resumen del envío). */
  detalle?: string[];
  si: string;
  no: string;
  /** El "sí" hace algo que no se puede deshacer: se pinta en rojo. */
  peligro?: boolean;
  alConfirmar: () => void;
}
