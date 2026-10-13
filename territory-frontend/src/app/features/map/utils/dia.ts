/**
 * Día de la predicación que elige el encargado al enviar (ADR 0018): hoy o
 * hasta 7 días atrás, por si informa al día siguiente. Puro, sin reloj propio.
 */

export const DIAS_ATRAS = 7;

export interface DiaElegible {
  /** 0 = hoy, 1 = ayer… */
  atras: number;
  /** "2026-10-13" en la hora del teléfono (lo que se guarda). */
  iso: string;
  /** "mar 13". */
  corto: string;
  /** "Hoy", "Ayer" o "Lun 12". */
  nombre: string;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function restar(hoy: Date, dias: number): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias, 12);
}

/** Fecha local "AAAA-MM-DD" (no UTC: de noche en Chile, UTC ya es mañana). */
export function isoLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function diaElegible(atras: number, hoy = new Date()): DiaElegible {
  const d = restar(hoy, atras);
  const corto = `${DIAS[d.getDay()]} ${d.getDate()}`;
  const nombre = atras === 0 ? 'Hoy' : atras === 1 ? 'Ayer' : corto.charAt(0).toUpperCase() + corto.slice(1);
  return { atras, iso: isoLocal(d), corto, nombre };
}

/** Los días que se pueden informar, de hoy hacia atrás. */
export function diasElegibles(hoy = new Date()): DiaElegible[] {
  return Array.from({ length: DIAS_ATRAS + 1 }, (_, i) => diaElegible(i, hoy));
}

/** "13-10-2026", como va en el mensaje de WhatsApp. */
export function fechaParaMensaje(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a}`;
}
