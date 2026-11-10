import { TestBed } from '@angular/core/testing';
import { PracticeDraftService, VIGENCIA_PRACTICA_MS } from './practice-draft';

const CLAVE = 'territory_practice_draft';
const DIA = 24 * 60 * 60 * 1000;

/** Lo guardado en la práctica se reconoce por su envoltorio con `savedAt`. */
function guardado(caducidad: number): number {
  const savedAt = Date.now() - caducidad;
  localStorage.setItem(CLAVE, JSON.stringify({ v: 1, savedAt, datos: { abiertos: [5] } }));
  return savedAt;
}

describe('PracticeDraftService', () => {
  let servicio: PracticeDraftService;

  beforeEach(() => {
    localStorage.clear();
    servicio = TestBed.inject(PracticeDraftService);
  });

  afterEach(() => localStorage.clear());

  it('guarda y devuelve lo guardado', () => {
    servicio.guardar({ abiertos: [5] });
    expect(servicio.cargar()).toEqual({ abiertos: [5] });
  });

  it('renueva el vencimiento cada vez que se guarda', () => {
    servicio.guardar({ abiertos: [5] }, Date.now() - 6 * DIA);
    servicio.guardar({ abiertos: [6] });
    expect(servicio.cargar()).toEqual({ abiertos: [6] });
  });

  it('al pasar los 7 días borra lo guardado y no lo devuelve', () => {
    const savedAt = guardado(0);
    expect(servicio.cargar(savedAt + VIGENCIA_PRACTICA_MS + 1)).toBeNull();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('justo en el límite de 7 días todavía lo conserva', () => {
    const savedAt = guardado(0);
    expect(servicio.cargar(savedAt + VIGENCIA_PRACTICA_MS)).toEqual({ abiertos: [5] });
  });

  it('limpiarSiVencio borra solo cuando corresponde', () => {
    const vencido = guardado(0);
    servicio.limpiarSiVencio(vencido + VIGENCIA_PRACTICA_MS + 1);
    expect(localStorage.getItem(CLAVE)).toBeNull();

    const vigente = guardado(0);
    servicio.limpiarSiVencio(vigente + DIA);
    expect(localStorage.getItem(CLAVE)).not.toBeNull();
  });

  it('un guardado roto se descarta y se borra', () => {
    localStorage.setItem(CLAVE, '{no-json');
    expect(servicio.cargar()).toBeNull();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('un guardado de otra versión se ignora', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ v: 2, savedAt: Date.now(), datos: { abiertos: [5] } }));
    expect(servicio.cargar()).toBeNull();
  });
});
