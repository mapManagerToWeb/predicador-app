import type { Polygon } from 'geojson';
import type { Reporte, UserProfile } from '../../../core/models/models';
import type { EstadoTerritorioPublico } from '../../../core/map/estado-publico';
import {
  abrirTerritorio,
  alternarManzana,
  aporteDe,
  baseDesdeEstado,
  envioDe,
  envioDeReportes,
  rebasar,
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

/** Estado público del territorio 5 (su último reporte). */
function estado(p: Partial<EstadoTerritorioPublico>): EstadoTerritorioPublico {
  return {
    territorio: 5, ultimoTrabajo: '2026-09-20T12:00:00Z', ultimoCompletado: null, estado: 'incomplete',
    manzanasMarcadas: 0, totalManzanas: 3, manzanasIds: null, geometriaParcial: null, puntosParciales: null, ...p,
  };
}

function reporte(p: Partial<Reporte>): Reporte {
  return {
    id: 1, manzanaId: null, fecha: '2026-09-20T12:00:00Z', encargadoId: 1, encargadoNombre: 'Ana',
    encargadoApellido: 'Pérez', sessionTime: '2026-09-20T12:00:00Z', estado: 'incomplete', territorioNumero: 5,
    totalManzanas: 3, manzanasMarcadas: 0, tipoSesion: 'parcial', geometriaParcial: null, puntosParciales: null,
    manzanasIds: null, ...p,
  };
}

const porId = (id: string) => MANZANAS.find(m => m.id === id);

const perfil: UserProfile = { name: 'Ana', lastName: 'Pérez', avatar: 0, encargadoId: 7 };

describe('salida', () => {
  describe('base desde el estado público del territorio', () => {
    it('sin reportes parte vacía', () => {
      expect(baseDesdeEstado(undefined, MANZANAS)).toEqual({ marcadas: [], zonas: [], fecha: null, vueltaNueva: false });
    });

    it('entiende ids "T-bloque" y los numéricos de reportes viejos', () => {
      const base = baseDesdeEstado(estado({ manzanasIds: '5-5.a,103' }), MANZANAS);
      expect(base.marcadas).toEqual(['5-5.a', '5-5.c']);
    });

    it('un territorio reiniciado al cerrar un ciclo empieza vacío', () => {
      expect(baseDesdeEstado(estado({ estado: 'reiniciado', manzanasIds: '' }), MANZANAS)).toEqual({
        marcadas: [], zonas: [], fecha: null, vueltaNueva: false,
      });
    });

    it('un territorio completado empieza una vuelta nueva sin marcas', () => {
      const base = baseDesdeEstado(estado({ estado: 'completed', manzanasIds: '5-5.a,5-5.b,5-5.c' }), MANZANAS);
      expect(base.marcadas).toEqual([]);
      expect(base.vueltaNueva).toBe(true);
    });

    it('recupera las manzanas marcadas por calles', () => {
      const lados = calcularLados(B.geometria);
      const t = guardarLados(abrirTerritorio(5, null), B, [0], lados.length);
      const { geometriaParcial, puntosParciales } = serializarZonas(t.zonas);
      const base = baseDesdeEstado(estado({ geometriaParcial, puntosParciales }), MANZANAS);
      expect(base.zonas).toHaveLength(1);
      expect(base.zonas[0]).toMatchObject({ manzanaId: '5-5.b', lados: [0] });
    });
  });

  describe('marcar y desmarcar', () => {
    it('un toque marca y otro toque desmarca', () => {
      const t0 = abrirTerritorio(5, baseDesdeEstado(undefined, MANZANAS));
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
      const base = baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS);
      const t = abrirTerritorio(5, base);
      expect(hayCambios(t)).toBe(false);
      expect(hayCambios(alternarManzana(t, B))).toBe(true);
      // Marcar y desmarcar vuelve a "sin cambios".
      expect(hayCambios(alternarManzana(alternarManzana(t, B), B))).toBe(false);
    });

    it('lo que vino en el último reporte no se puede desmarcar (lo corrige el administrador)', () => {
      const t = abrirTerritorio(5, baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS));
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
      const t = abrirTerritorio(5, baseDesdeEstado(estado({ manzanasIds: '', geometriaParcial, puntosParciales }), MANZANAS));
      expect(ladosDeLaBase(t, B.id, lados)).toEqual([0]);
      // Intentar dejarla sin la calle 0 la conserva; agregar la 1 suma.
      expect(guardarLados(t, B, [], lados).zonas[0].lados).toEqual([0]);
      expect(guardarLados(t, B, [1], lados).zonas[0].lados).toEqual([0, 1]);
      // Completarla entera sí se puede.
      const entera = alternarManzana(t, B);
      expect(entera.marcadas).toEqual(['5-5.b']);
      // Y si se desmarca (p. ej. por error), vuelven las calles del último reporte.
      const desmarcada = alternarManzana(entera, B);
      expect(desmarcada.marcadas).toEqual([]);
      expect(ladosElegidos(desmarcada, B.id, lados)).toEqual([0]);
      expect(hayCambios(desmarcada)).toBe(false);
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

  describe('aporte de la salida y base más nueva (ADR 0013)', () => {
    const ladosB = calcularLados(B.geometria).length;

    it('el aporte es solo lo que marcó esta salida: manzanas nuevas y calles nuevas', () => {
      const conB0 = guardarLados(abrirTerritorio(5, null), B, [0], ladosB);
      const { geometriaParcial, puntosParciales } = serializarZonas(conB0.zonas);
      const base = baseDesdeEstado(estado({ manzanasIds: '5-5.a', geometriaParcial, puntosParciales }), MANZANAS);
      let t = abrirTerritorio(5, base);
      t = alternarManzana(t, C);
      t = guardarLados(t, B, [1], ladosB);

      const aporte = aporteDe(t, porId);

      expect(aporte.marcadas).toEqual(['5-5.c']);
      expect(aporte.zonas).toHaveLength(1);
      expect(aporte.zonas[0]).toMatchObject({ manzanaId: '5-5.b', lados: [1], totalLados: ladosB });
    });

    it('sin cambios no aporta nada', () => {
      const t = abrirTerritorio(5, baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS));
      expect(aporteDe(t, porId)).toEqual({ marcadas: [], zonas: [] });
    });

    it('sobre una base más nueva se suman las marcas de los dos hermanos', () => {
      // Yo marqué B con el territorio vacío; mientras tanto otro reportó A.
      const mio = alternarManzana(abrirTerritorio(5, baseDesdeEstado(undefined, MANZANAS)), B);
      const nueva = baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS);

      const r = rebasar(mio, nueva, porId);

      expect(r.marcadas).toEqual(['5-5.a', '5-5.b']);
      expect(r.base).toBe(nueva);
      expect(enteraEnLaBase(r, A.id)).toBe(true);
      expect(hayCambios(r)).toBe(true);
    });

    it('tras cerrarse el ciclo no vuelven las marcas de la vuelta anterior', () => {
      // El borrador tenía A del ciclo anterior (base) y B nueva; el administrador reinició.
      const viejo = alternarManzana(abrirTerritorio(5, baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS)), B);
      const reiniciado = baseDesdeEstado(estado({ estado: 'reiniciado', manzanasIds: '' }), MANZANAS);

      expect(rebasar(viejo, reiniciado, porId).marcadas).toEqual(['5-5.b']);
    });

    it('las calles nuevas se suman a las que ya reportó otro en la misma manzana', () => {
      const mio = guardarLados(abrirTerritorio(5, null), B, [1], ladosB);
      const deOtro = guardarLados(abrirTerritorio(5, null), B, [0], ladosB);
      const { geometriaParcial, puntosParciales } = serializarZonas(deOtro.zonas);
      const nueva = baseDesdeEstado(estado({ manzanasIds: '', geometriaParcial, puntosParciales }), MANZANAS);

      const r = rebasar(mio, nueva, porId);

      expect(ladosElegidos(r, B.id, ladosB)).toEqual([0, 1]);
      expect(ladosDeLaBase(r, B.id, ladosB)).toEqual([0]);
    });

    it('si ya estaba todo reportado, no queda nada nuevo', () => {
      const mio = alternarManzana(abrirTerritorio(5, baseDesdeEstado(undefined, MANZANAS)), A);
      const nueva = baseDesdeEstado(estado({ manzanasIds: '5-5.a' }), MANZANAS);
      expect(hayCambios(rebasar(mio, nueva, porId))).toBe(false);
    });

    it('el total de calles viaja con la zona, para que el servidor sepa si quedó entera', () => {
      const t = guardarLados(abrirTerritorio(5, null), B, [0], ladosB);
      const { puntosParciales } = serializarZonas(t.zonas);
      expect(JSON.parse(puntosParciales!).zonas[0].t).toBe(ladosB);
      const leida = baseDesdeEstado(estado({ manzanasIds: '', puntosParciales }), MANZANAS).zonas[0];
      expect(leida.totalLados).toBe(ladosB);
    });

    it('el WhatsApp dice cómo quedó en el servidor (completo con marcas de otro)', () => {
      const envio = envioDeReportes([reporte({ estado: 'completed', manzanasMarcadas: 3 })]);
      expect(envio).toEqual({
        territorios: [{ numero: 5, finalizado: true, totalManzanas: 3, manzanasMarcadas: 3 }],
        requiereScreenshot: false,
      });
      expect(envioDeReportes([reporte({}), reporte({ territorioNumero: 6 })]).requiereScreenshot).toBe(true);
    });
  });

  it('elige el turno según la hora', () => {
    expect(turnoPorHora(new Date(2026, 8, 26, 10))).toBe('mañana');
    expect(turnoPorHora(new Date(2026, 8, 26, 16))).toBe('tarde');
  });
});
