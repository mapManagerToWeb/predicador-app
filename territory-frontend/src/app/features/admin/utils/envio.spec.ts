import type { ReporteAdmin } from '../admin.models';
import { envioDe } from './envio';

let siguiente = 1;
function r(p: Partial<ReporteAdmin>): ReporteAdmin {
  return {
    id: siguiente++,
    fecha: '2026-11-22T15:00:00Z',
    inicioSesion: '2026-11-22T13:00:00Z',
    encargadoId: 7,
    encargadoNombre: 'Ana',
    encargadoApellido: 'Pérez',
    territorio: 1,
    estado: 'incomplete',
    tipoSesion: 'parcial',
    totalManzanas: 5,
    manzanasMarcadas: 2,
    manzanasIds: null,
    tieneParcial: false,
    origen: 'salida',
    fechaPredicacion: '2026-11-22',
    turno: 'mañana',
    ...p,
  };
}

describe('envioDe: los territorios que un hermano mandó juntos', () => {
  it('junta los del mismo inicio de salida, ordenados por territorio', () => {
    const a = r({ territorio: 12 });
    const b = r({ territorio: 3, fecha: '2026-11-22T15:00:01Z' });
    const otraSalida = r({ territorio: 8, inicioSesion: '2026-11-22T16:00:00Z', fecha: '2026-11-22T15:00:30Z' });
    const otroHermano = r({ territorio: 9, encargadoId: 8 });
    const otroTurno = r({ territorio: 10, turno: 'tarde' });
    const otroDia = r({ territorio: 11, fechaPredicacion: '2026-11-21' });
    const anulado = r({ territorio: 13, anuladoEn: '2026-11-23T10:00:00Z' });
    const reinicio = r({ territorio: 14, origen: 'reinicio' });
    const todos = [a, b, otraSalida, otroHermano, otroTurno, otroDia, anulado, reinicio];
    expect(envioDe(a, todos).map(x => x.territorio)).toEqual([3, 12]);
    expect(envioDe(otraSalida, todos).map(x => x.territorio)).toEqual([8]);
  });

  it('sin hora de inicio (versiones viejas o el panel) junta los guardados con menos de 2 minutos', () => {
    const a = r({ territorio: 1, inicioSesion: null, encargadoId: null });
    const b = r({ territorio: 2, inicioSesion: null, encargadoId: null, encargadoApellido: 'PÉREZ', fecha: '2026-11-22T15:01:30Z' });
    const lejos = r({ territorio: 3, inicioSesion: null, encargadoId: null, fecha: '2026-11-22T15:05:00Z' });
    expect(envioDe(a, [a, b, lejos]).map(x => x.territorio)).toEqual([1, 2]);
  });

  it('un territorio va una sola vez, y lo que no es una salida va solo', () => {
    const viejo = r({ territorio: 5 });
    const nuevo = r({ territorio: 5 });
    const otro = r({ territorio: 6 });
    expect(envioDe(otro, [viejo, nuevo, otro]).map(x => x.id)).toEqual([nuevo.id, otro.id]);
    expect(envioDe(viejo, [viejo, nuevo, otro]).map(x => x.id)).toEqual([viejo.id, otro.id]);
    const reinicio = r({ origen: 'reinicio' });
    expect(envioDe(reinicio, [reinicio, viejo])).toEqual([reinicio]);
  });
});
