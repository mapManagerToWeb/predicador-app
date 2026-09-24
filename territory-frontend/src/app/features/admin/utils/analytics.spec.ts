import type { ReporteAdmin } from '../admin.models';
import {
  cobertura,
  deduplicar,
  duplicados,
  estadoPorDias,
  inicioPeriodo,
  mapaDeCalor,
  mediana,
  porEncargado,
  porPeriodo,
  registroTerritorios,
  resumen,
  sesiones,
} from './analytics';
import { aCsv } from './csv';

/** Fecha en hora local → ISO, para que los tests no dependan de la zona horaria. */
function local(anio: number, mes: number, dia: number, hora = 10, minuto = 0): string {
  return new Date(anio, mes - 1, dia, hora, minuto).toISOString();
}

let siguienteId = 1;
function reporte(parcial: Partial<ReporteAdmin>): ReporteAdmin {
  return {
    id: siguienteId++,
    fecha: local(2026, 9, 1),
    inicioSesion: null,
    encargadoId: 1,
    encargadoNombre: 'Ana',
    encargadoApellido: 'Pérez',
    territorio: 1,
    estado: 'incomplete',
    tipoSesion: 'parcial',
    totalManzanas: 4,
    manzanasMarcadas: 2,
    manzanasIds: '1,2',
    tieneParcial: false,
    ...parcial,
  };
}

describe('analytics del panel', () => {
  beforeEach(() => {
    siguienteId = 1;
  });

  describe('deduplicar', () => {
    it('descarta un doble envío idéntico a pocos segundos', () => {
      const a = reporte({ fecha: local(2026, 9, 19, 16, 37), estado: 'completed', manzanasIds: '793,792' });
      const b = { ...a, id: 99, fecha: new Date(new Date(a.fecha).getTime() + 12_000).toISOString() };
      expect(deduplicar([b, a]).map(r => r.id)).toEqual([a.id]);
      expect(duplicados([a, b]).map(r => r.id)).toEqual([99]);
    });

    it('conserva reportes distintos o separados en el tiempo', () => {
      const a = reporte({ fecha: local(2026, 9, 1, 10) });
      const otroTerritorio = reporte({ fecha: local(2026, 9, 1, 10), territorio: 2 });
      const otroDia = reporte({ fecha: local(2026, 9, 2, 10) });
      expect(deduplicar([a, otroTerritorio, otroDia])).toHaveLength(3);
    });
  });

  describe('sesiones y tiempo por manzana', () => {
    it('agrupa los territorios enviados juntos en una sola salida', () => {
      const inicio = local(2026, 9, 5, 9, 0);
      const r1 = reporte({ inicioSesion: inicio, fecha: local(2026, 9, 5, 10, 0), territorio: 1, manzanasMarcadas: 3 });
      const r2 = reporte({ inicioSesion: inicio, fecha: local(2026, 9, 5, 10, 0), territorio: 2, manzanasMarcadas: 3 });
      const s = sesiones([r1, r2]);
      expect(s).toHaveLength(1);
      expect(s[0].manzanas).toBe(6);
      expect(s[0].territorios).toEqual([1, 2]);

      const res = resumen([r1, r2]);
      expect(res.horas).toBe(1);
      expect(res.minutosPorManzana).toBe(10);
      expect(res.salidasMedidas).toBe(1);
    });

    it('ignora reportes sin inicio y salidas absurdas', () => {
      const sinInicio = reporte({});
      const borradorOlvidado = reporte({ inicioSesion: local(2026, 9, 1, 8), fecha: local(2026, 9, 3, 8) });
      const instantanea = reporte({ inicioSesion: local(2026, 9, 1, 10, 0), fecha: local(2026, 9, 1, 10, 0) });
      expect(sesiones([sinInicio, borradorOlvidado, instantanea])).toEqual([]);
      expect(resumen([sinInicio]).minutosPorManzana).toBeNull();
    });

    it('mediana', () => {
      expect(mediana([])).toBeNull();
      expect(mediana([5, 1, 3])).toBe(3);
      expect(mediana([4, 1, 3, 2])).toBe(2.5);
    });
  });

  it('resumen cuenta territorios, completados y encargados distintos', () => {
    const r = resumen([
      reporte({ territorio: 1, estado: 'completed', manzanasMarcadas: 4 }),
      reporte({ territorio: 1, manzanasMarcadas: 1 }),
      reporte({ territorio: 2, encargadoId: 2, encargadoNombre: 'Luis', manzanasMarcadas: 2 }),
    ]);
    expect(r).toMatchObject({
      reportes: 3,
      manzanas: 7,
      territoriosTrabajados: 2,
      territoriosCompletados: 1,
      encargadosActivos: 2,
    });
  });

  describe('porPeriodo', () => {
    it('las semanas empiezan el lunes en hora local', () => {
      // 2026-09-24 es jueves → la semana empieza el lunes 21.
      expect(inicioPeriodo(new Date(2026, 8, 24, 23, 30), 'semana')).toEqual(new Date(2026, 8, 21));
      expect(inicioPeriodo(new Date(2026, 8, 24), 'mes')).toEqual(new Date(2026, 8, 1));
    });

    it('incluye las semanas sin actividad', () => {
      const puntos = porPeriodo(
        [reporte({ fecha: local(2026, 9, 1), manzanasMarcadas: 3 }), reporte({ fecha: local(2026, 9, 16), estado: 'completed' })],
        new Date(2026, 7, 31),
        new Date(2026, 8, 20),
        'semana',
      );
      expect(puntos.map(p => [p.manzanas, p.completados])).toEqual([
        [3, 0],
        [0, 0],
        [2, 1],
      ]);
    });
  });

  it('porEncargado ordena por manzanas y mide su tiempo', () => {
    const filas = porEncargado([
      reporte({ encargadoId: 1, manzanasMarcadas: 2 }),
      reporte({
        encargadoId: 2,
        encargadoNombre: 'Luis',
        manzanasMarcadas: 6,
        inicioSesion: local(2026, 9, 1, 9),
        fecha: local(2026, 9, 1, 10),
      }),
    ]);
    expect(filas.map(f => f.nombre)).toEqual(['Luis Pérez', 'Ana Pérez']);
    expect(filas[0].minutosPorManzana).toBe(10);
    expect(filas[1].minutosPorManzana).toBeNull();
  });

  it('mapaDeCalor ubica cada reporte por día de semana (lunes = 0) y hora local', () => {
    const m = mapaDeCalor([reporte({ fecha: local(2026, 9, 21, 18) }), reporte({ fecha: local(2026, 9, 27, 9) })]);
    expect(m[0][18]).toBe(1); // lunes 18:00
    expect(m[6][9]).toBe(1); // domingo 09:00
    expect(m.flat().reduce((a, b) => a + b, 0)).toBe(2);
  });

  describe('cobertura', () => {
    const hoy = new Date(2026, 8, 24);

    it('clasifica por días desde que se completó', () => {
      expect(estadoPorDias(null)).toBe('sin-registro');
      expect(estadoPorDias(10)).toBe('al-dia');
      expect(estadoPorDias(200)).toBe('pendiente');
      expect(estadoPorDias(400)).toBe('atrasado');
    });

    it('marca en curso con avance y conserva la última vez completado', () => {
      const res = cobertura(
        [
          reporte({ territorio: 5, estado: 'completed', fecha: local(2026, 9, 1) }),
          reporte({ territorio: 5, fecha: local(2026, 9, 20), manzanasMarcadas: 1, totalManzanas: 4 }),
        ],
        new Map([
          [5, 4],
          [6, 3],
        ]),
        hoy,
      );
      const t5 = res.find(t => t.territorio === 5)!;
      expect(t5.estado).toBe('al-dia');
      expect(t5.diasDesdeCompletado).toBe(23);
      expect(t5.enCurso).toBe(true);
      expect(t5.avance).toBe(0.25);
      expect(t5.vecesCompletado).toBe(1);
      const t6 = res.find(t => t.territorio === 6)!;
      expect(t6.estado).toBe('sin-registro');
      expect(t6.ultimoTrabajo).toBeNull();
    });
  });

  it('registroTerritorios arma ciclos que terminan al completarse', () => {
    const ciclos = registroTerritorios([
      reporte({ territorio: 3, fecha: local(2026, 8, 1), encargadoNombre: 'Ana' }),
      reporte({ territorio: 3, fecha: local(2026, 8, 5), encargadoNombre: 'Luis', estado: 'completed' }),
      reporte({ territorio: 3, fecha: local(2026, 9, 10), encargadoNombre: 'Ana' }),
    ]);
    expect(ciclos).toHaveLength(2);
    expect(ciclos[0].fin).toEqual(new Date(local(2026, 8, 5)));
    expect(ciclos[0].encargados).toEqual(['Ana Pérez', 'Luis Pérez']);
    expect(ciclos[1].fin).toBeNull();
  });

  it('aCsv usa ; con BOM, escapa comillas y neutraliza fórmulas', () => {
    const csv = aCsv(['Nombre', 'Valor'], [
      ['Ana; "la jefa"', 1.5],
      ['=HYPERLINK("x")', null],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Ana; ""la jefa""";1,5');
    expect(csv).toContain(`"'=HYPERLINK(""x"")";`);
  });
});
