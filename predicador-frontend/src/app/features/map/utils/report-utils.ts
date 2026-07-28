import type { Reporte } from '../../../core/models/models';

export function elegirUltimoReporte(reportes: Reporte[]): Reporte | null {
  if (!reportes.length) return null;

  return reportes.reduce<Reporte | null>((best, r) => {
    if (!best) return r;

    const rTime = new Date(r.sessionTime).getTime();
    const bTime = new Date(best.sessionTime).getTime();

    if (Number.isNaN(rTime) && Number.isNaN(bTime)) return (r.id ?? 0) > (best.id ?? 0) ? r : best;
    if (Number.isNaN(rTime)) return best;
    if (Number.isNaN(bTime)) return r;

    return rTime > bTime ? r : best;
  }, null);
}
