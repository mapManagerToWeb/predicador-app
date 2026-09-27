import type { Polygon } from 'geojson';
import type { Reporte, UserProfile } from '../../../core/models/models';
import {
  abrirTerritorio,
  alternarManzana,
  baseDesdeReporte,
  envioDe,
  guardarLados,
  hayCambios,
  ladosElegidos,
  registroDe,
  enteraEnLaBase,
  ladosDeLaBase,
  resumir,
  turnoPorHora,
  type Manzana,
} from './salida';
import { calcularLados, serializarZonas } from './lados';

const cuadrado = (x: number, y: number, lado = 0.001): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]],
});

const manzana = (letra: string, x: number, mid?: number): Manzana => ({
  id: `5-5.${letra}`,
  mid,
  nombre: `5.${letra}`,
  territorio: 5,
  geometria: cuadrado(x, -37.5),
});

const A = manzana('a', -73.34, 101);
const B = manzana('b', -73.338, 102);
const C = manzana('c', -73.336, 103);
const MANZANAS = [A, B, C];

function reporte(p: Partial<Reporte>): Reporte {
  return {
    id: 1, manzanaId: null, fecha: '2026-09-20T12:00:00Z', encargadoId: 1, encargadoNombre: 'Ana',
    encargadoApellido: 'Pérez', sessionTime: '2026-09-20T12:00:00Z', estado: 'incomplete', territorioNumero: 5,
    totalManzanas: 3, manzanasMarcadas: 0, tipoSesion: 'parcial', geometriaParcial: null, puntosParciales: null,
    manzanasIds: null, ...p,
  };
}

const perfil: UserProfile = { name: 'Ana', lastName: 'Pérez', avatar: 0, encargadoId: 7 };

describe('salida', () => {
  describe('base desde el último reporte', () => {
    it('sin reportes parte vacía', () => {
      expect(baseDesdeReporte(null, MANZANAS)).toEqual({ marcadas: [], zonas: [], fecha: null, vueltaNueva: false });
    });

    it('entiende ids "T-bloque" y los numéricos de reportes viejos', () => {
      const base = baseDesdeReporte(reporte({ manzanasIds: '5-5.a,103' }), MANZANAS);
      expect(base.marcadas).toEqual(['5-5.a', '5-5.c']);
    });

    it('un territorio reiniciado al cerrar un ciclo empieza vacío', () => {
      expect(baseDesdeReporte(reporte({ estado: 'reiniciado', manzanasIds: '' }), MANZANAS)).toEqual({
        marcadas: [], zonas: [], fecha: null, vueltaNueva: false,
      });
    });

    it('un territorio completado empieza una vuelta nueva sin marcas', () => {
      const base = baseDesdeReporte(reporte({ estado: 'completed', manzanasIds: '5-5.a,5-5.b,5-5.c' }), MANZANAS);
      expect(base.marcadas).toEqual([]);
      expect(base.vueltaNueva).toBe(true);
    });

    it('recupera las manzanas marcadas por calles', () => {
      const lados = calcularLados(B.geometria);
      const t = guardarLados(abrirTerritorio(5, null), B, [0], lados.length);
      const { geometriaParcial, puntosParciales } = serializarZonas(t.zonas);
      const base = baseDesdeReporte(reporte({ geometriaParcial, puntosParciales }), MANZANAS);
      expect(base.zonas).toHaveLength(1);
      expect(base.zonas[0]).toMatchObject({ manzanaId: '5-5.b', lados: [0] });
    });
  });

  describe('marcar y desmarcar', () => {
    it('un toque marca y otro toque desmarca', () => {
      const t0 = abrirTerritorio(5, baseDesdeReporte(null, MANZANAS));
      const t1 = alternarManzana(t0, A);
      expect(t1.marcadas).toEqual(['5-5.a']);
      const t2 = alternarManzana(t1, A);
      expect(t2.marcadas).toEqual([]);
    });

    it('marcar entera una manzana reemplaza lo marcado por calles', () => {
      const t = guardarLados(abrirTerritorio(5, null), A, [0, 1], 4);
      expect(t.zonas).toHaveLength(1);
      const entera = alternarManzana(t, A);
      expect(entera.zonas).toHaveLength(0);
      expect(entera.marcadas).toEqual(['5-5.a']);
    });

    it('por calles: ninguna la desmarca y todas la marcan entera', () => {
      const total = calcularLados(A.geometria).length;
      const entera = guardarLados(abrirTerritorio(5, null), A, Array.from({ length: total }, (_, i) => i), total);
      expect(entera.marcadas).toEqual(['5-5.a']);
      expect(ladosElegidos(entera, A.id, total)).toHaveLength(total);
      const nada = guardarLados(entera, A, [], total);
      expect(nada.marcadas).toEqual([]);
      expect(nada.zonas).toEqual([]);
    });

    it('marcar entera una manzana quita las zonas antiguas (trazo libre) que tenía adentro', () => {
      const antigua = { manzanaId: null, manzanaNombre: 'Zona parcial', lados: [], geometria: cuadrado(-73.3398, -37.4998, 0.0004) };
      const t = { ...abrirTerritorio(5, null), zonas: [antigua] };
      expect(alternarManzana(t, A).zonas).toEqual([]);
      expect(alternarManzana(t, C).zonas).toEqual([antigua]);
    });
  });

  describe('cambios', () => {
    it('no hay cambios hasta que se marca algo distinto del último reporte', () => {
      const base = baseDesdeReporte(reporte({ manzanasIds: '5-5.a' }), MANZANAS);
      const t = abrirTerritorio(5, base);
      expect(hayCambios(t)).toBe(false);
      expect(hayCambios(alternarManzana(t, B))).toBe(true);
      // Marcar y desmarcar vuelve a "sin cambios".
      expect(hayCambios(alternarManzana(alternarManzana(t, B), B))).toBe(false);
    });

    it('lo que vino en el último reporte no se puede desmarcar (lo corrige el administrador)', () => {
      const t = abrirTerritorio(5, baseDesdeReporte(reporte({ manzanasIds: '5-5.a' }), MANZANAS));
      expect(enteraEnLaBase(t, A.id)).toBe(true);
      expect(alternarManzana(t, A)).toBe(t);
      expect(guardarLados(t, A, [0], 4)).toBe(t);
      // Lo marcado en esta salida sí se puede desmarcar.
      const conB = alternarManzana(t, B);
      expect(alternarManzana(conB, B).marcadas).toEqual(['5-5.a']);
    });

    it('las calles del último reporte quedan; solo se pueden agregar otras', () => {
      const lados = calcularLados(B.geometria).length;
      const conZona = guardarLados(abrirTerritorio(5, null), B, [0], lados);
      const { geometriaParcial, puntosParciales } = serializarZonas(conZona.zonas);
      const t = abrirTerritorio(5, baseDesdeReporte(reporte({ manzanasIds: '', geometriaParcial, puntosParciales }), MANZANAS));
      expect(ladosDeLaBase(t, B.id, lados)).toEqual([0]);
      // Intentar dejarla sin la calle 0 la conserva; agregar la 1 suma.
      expect(guardarLados(t, B, [], lados).zonas[0].lados).toEqual([0]);
      expect(guardarLados(t, B, [1], lados).zonas[0].lados).toEqual([0, 1]);
      // Completarla entera sí se puede.
      expect(alternarManzana(t, B).marcadas).toEqual(['5-5.b']);
    });
  });

  describe('reporte', () => {
    it('arma el registro con las manzanas enteras y las zonas por calles', () => {
      let t = alternarManzana(abrirTerritorio(5, null), A);
      t = guardarLados(t, B, [0], 4);
      const r = registroDe(t, 3, perfil, '2026-09-26T10:00:00.000Z', new Date('2026-09-26T11:00:00Z'));
      expect(r).toMatchObject({
        territorioNumero: 5,
        manzanaId: '5-5.a',
        manzanasIds: '5-5.a',
        manzanasMarcadas: 2,
        totalManzanas: 3,
        estado: 'incomplete',
        encargadoId: 7,
        inicioSesion: '2026-09-26T10:00:00.000Z',
        sessionTime: '2026-09-26T11:00:00.000Z',
      });
      expect(JSON.parse(r.puntosParciales!)).toMatchObject({ v: 2, zonas: [{ m: '5-5.b', l: [0] }] });
    });

    it('todas las manzanas enteras lo completan', () => {
      const t = MANZANAS.reduce((acc, m) => alternarManzana(acc, m), abrirTerritorio(5, null));
      expect(registroDe(t, 3, perfil, null).estado).toBe('completed');
      expect(resumir(t, 3).completo).toBe(true);
    });

    it('un único territorio completo va sin captura; con varios van todos, con captura', () => {
      const completo = { numero: 5, total: 3, enteras: 3, porCalles: 0, completo: true, cambios: true };
      const incompleto = { numero: 6, total: 4, enteras: 1, porCalles: 1, completo: false, cambios: true };
      expect(envioDe([completo])).toEqual({
        territorios: [{ numero: 5, finalizado: true, totalManzanas: 3, manzanasMarcadas: 3 }],
        requiereScreenshot: false,
      });
      expect(envioDe([completo, incompleto])).toEqual({
        territorios: [
          { numero: 5, finalizado: true, totalManzanas: 3, manzanasMarcadas: 3 },
          { numero: 6, finalizado: false, totalManzanas: 4, manzanasMarcadas: 2 },
        ],
        requiereScreenshot: true,
      });
      // Dos completos en la misma salida: el mensaje no puede quedar vacío (el servidor lo rechaza).
      const otroCompleto = { ...completo, numero: 7 };
      expect(envioDe([completo, otroCompleto]).territorios.map(t => t.numero)).toEqual([5, 7]);
      expect(envioDe([completo, otroCompleto]).requiereScreenshot).toBe(true);
    });
  });

  it('elige el turno según la hora', () => {
    expect(turnoPorHora(new Date(2026, 8, 26, 10))).toBe('mañana');
    expect(turnoPorHora(new Date(2026, 8, 26, 16))).toBe('tarde');
  });
});
