import type { ReporteAdmin } from '../admin.models';

/**
 * Un mismo envío: la app guarda una fila por territorio, pero el hermano los
 * mandó juntos en un solo WhatsApp. Son del mismo envío las salidas vigentes
 * del mismo hermano, con el mismo día y turno de predicación, y la misma hora
 * de inicio de la salida (la app la pone en todas y la renueva después de
 * enviar). Las que no la tienen (versiones viejas, «Registrar salida»)
 * se juntan si se guardaron con menos de `MARGEN_MS` de diferencia.
 */
export const MARGEN_MS = 2 * 60_000;

const quien = (r: ReporteAdmin) =>
  r.encargadoId != null ? `id:${r.encargadoId}` : `${r.encargadoNombre ?? ''} ${r.encargadoApellido ?? ''}`.trim().toLowerCase();

const esSalidaVigente = (r: ReporteAdmin) => !r.anuladoEn && (!r.origen || r.origen === 'salida');

function mismoEnvio(a: ReporteAdmin, b: ReporteAdmin): boolean {
  if (quien(a) !== quien(b)) return false;
  if ((a.fechaPredicacion ?? '') !== (b.fechaPredicacion ?? '') || (a.turno ?? '') !== (b.turno ?? '')) return false;
  if (a.inicioSesion && b.inicioSesion) return a.inicioSesion === b.inicioSesion;
  return Math.abs(Date.parse(a.fecha) - Date.parse(b.fecha)) <= MARGEN_MS;
}

/** Las filas del envío al que pertenece `reporte` (él incluido), por número de territorio. */
export function envioDe(reporte: ReporteAdmin, todos: readonly ReporteAdmin[]): ReporteAdmin[] {
  if (!esSalidaVigente(reporte)) return [reporte];
  const delEnvio = todos.filter(r => r.id === reporte.id || (esSalidaVigente(r) && mismoEnvio(reporte, r)));
  // Un territorio una sola vez (el último guardado), por si se corrigió dentro del envío.
  const porTerritorio = new Map<number, ReporteAdmin>();
  for (const r of delEnvio) {
    const antes = porTerritorio.get(r.territorio);
    if (!antes || r.id === reporte.id || (antes.id !== reporte.id && r.id > antes.id)) porTerritorio.set(r.territorio, r);
  }
  return [...porTerritorio.values()].sort((a, b) => a.territorio - b.territorio);
}
