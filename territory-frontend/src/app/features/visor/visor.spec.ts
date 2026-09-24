import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { VisorPage } from './visor';

const mapa = {
  addControl: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  on: vi.fn(),
  fitBounds: vi.fn(),
  setFilter: vi.fn(),
  remove: vi.fn(),
  getCanvas: () => ({ style: {} }),
};

vi.mock('../../core/map/base-map', async importOriginal => ({
  ...(await importOriginal<typeof import('../../core/map/base-map')>()),
  crearMapa: vi.fn(async () => ({ maplibre: { GeolocateControl: class {} }, map: mapa })),
  cambiarFondo: vi.fn(),
}));

const cuadrado = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

describe('VisorPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [VisorPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function abrir() {
    const fixture = TestBed.createComponent(VisorPage);
    await fixture.whenStable();
    const api = environment.apiUrl;
    http.expectOne(`${api}/territories/all/geojson`).flush({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: cuadrado, properties: { id: '5-5.a', mid: 11, nombre_bloque: '5.a', territorio_padre: 5, color: null } },
        { type: 'Feature', geometry: cuadrado, properties: { id: '5-5.b', mid: 12, nombre_bloque: '5.b', territorio_padre: 5, color: null } },
      ],
    });
    http.expectOne(`${api}/territories/colors`).flush({ 5: '#ec4899' });
    const estado = http.expectOne(`${api}/reports/public/estado`);
    expect(estado.request.headers.get('ngsw-bypass')).toBe('true');
    estado.flush([
      {
        territorio: 5, ultimoTrabajo: new Date().toISOString(), ultimoCompletado: null, estado: 'incomplete',
        manzanasMarcadas: 1, totalManzanas: 2, manzanasIds: '11', geometriaParcial: null,
      },
    ]);
    await vi.waitFor(() => expect(mapa.addLayer).toHaveBeenCalled());
    await fixture.whenStable();
    return fixture;
  }

  it('dibuja las manzanas y no ofrece ninguna acción de edición', async () => {
    const fixture = await abrir();
    const el = fixture.nativeElement as HTMLElement;

    expect(mapa.addSource).toHaveBeenCalledWith('manzanas', expect.objectContaining({ type: 'geojson' }));
    expect(el.textContent).not.toMatch(/Marcar|Enviar|Guardar/);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('al buscar un territorio muestra su estado y fecha', async () => {
    const fixture = await abrir();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;

    input.value = '5';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const ficha = el.querySelector('.ficha')!;
    expect(ficha.textContent).toContain('Territorio 5');
    expect(ficha.textContent).toContain('En curso');
    expect(ficha.textContent).toContain('1 de 2 manzanas');
    expect(ficha.textContent).toContain('hoy');
    expect(mapa.fitBounds).toHaveBeenCalled();
  });

  it('avisa si el territorio buscado no existe', async () => {
    const fixture = await abrir();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;

    input.value = '99';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No existe el territorio 99');
  });
});
