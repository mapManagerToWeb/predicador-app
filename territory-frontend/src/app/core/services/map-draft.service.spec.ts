import { DraftMarksService } from './map-draft';

describe('DraftMarksService', () => {
  let service: DraftMarksService;

  beforeEach(() => {
    localStorage.clear();
    service = new DraftMarksService();
  });

  it('guarda y lee el borrador como JSON', () => {
    service.guardar({ v: 2, abiertos: [5] });
    expect(service.cargar()).toEqual({ v: 2, abiertos: [5] });
  });

  it('devuelve null si no hay borrador o está roto', () => {
    expect(service.cargar()).toBeNull();
    localStorage.setItem('territory_map_draft', '{roto');
    expect(service.cargar()).toBeNull();
    expect(localStorage.getItem('territory_map_draft')).toBeNull();
  });

  it('clear lo borra (logout)', () => {
    service.guardar({ v: 2 });
    service.clear();
    expect(service.cargar()).toBeNull();
  });
});
