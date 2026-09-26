import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { WhatsAppService } from './services/whatsapp';
import { MapPage } from './map';
import { MapaStore } from './mapa.store';

const vista = {
  mostrar: vi.fn(),
  encuadrar: vi.fn(),
  encuadrarTodo: vi.fn(),
  mostrarLados: vi.fn(),
  capturar: vi.fn(),
  alternarUbicacion: vi.fn(),
  cambiarFondo: vi.fn(),
  destruir: vi.fn(),
};
vi.mock('./mapa-vista', () => ({ MapaVista: { crear: vi.fn(async () => vista) } }));

const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: ['a', 'b'].map((l, i) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[i, 0], [i + 1, 0], [i + 1, 1], [i, 1], [i, 0]]] },
    properties: { id: `5-5.${l}`, nombre_bloque: `5.${l}`, territorio_padre: 5, color: '#f00' },
  })),
});

describe('MapPage', () => {
  let http: HttpTestingController;

  async function abrirPagina(tutorialVisto = true) {
    if (tutorialVisto) localStorage.setItem('mapa.tutorial.visto', '1');
    const fixture = TestBed.createComponent(MapPage);
    await fixture.whenStable();
    await Promise.resolve();
    http.expectOne(r => r.url.endsWith('/reports/public/estado')).flush([]);
    await vi.waitFor(() => expect(vista.mostrar).toHaveBeenCalled());
    await fixture.whenStable();
    const store = fixture.debugElement.injector.get(MapaStore);
    return { fixture, el: fixture.nativeElement as HTMLElement, store };
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TerritorioService,
          useValue: {
            getAllGeoJson: vi.fn().mockResolvedValue(GEOJSON),
            getColores: vi.fn().mockResolvedValue({}),
            getReportesPorTerritorio: vi.fn().mockResolvedValue([]),
          },
        },
        { provide: WhatsAppService, useValue: { sendReport: vi.fn() } },
        { provide: Profile, useValue: { currentUser: () => ({ name: 'Ana', lastName: 'P', avatar: 0 }), clear: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('sin territorio abierto explica cómo empezar', async () => {
    const { el } = await abrirPagina();
    expect(el.querySelector('.panel')?.textContent).toContain('Busca tu territorio');
    expect(el.querySelector('app-tutorial')).toBeNull();
  });

  it('muestra el tutorial la primera vez', async () => {
    const { el } = await abrirPagina(false);
    expect(el.querySelector('app-tutorial')).not.toBeNull();
  });

  it('buscar abre el territorio y el panel muestra la cuenta y los modos', async () => {
    const { fixture, el } = await abrirPagina();
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(el.querySelector('.territorio-nombre')?.textContent).toContain('Territorio 5'));
    await fixture.whenStable();
    expect(el.querySelector('.territorio-cuenta')?.textContent).toContain('0 de 2 manzanas');
    expect(el.querySelector('.modos')?.textContent).toContain('Por calles');
    expect((el.querySelector('.boton.enviar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('borrar el texto del buscador no toca lo marcado', async () => {
    const { fixture, el, store } = await abrirPagina();
    await store.abrir(5);
    store.tocar({ manzana: '5-5.a', cercana: null });
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(store.resumenes()[0].enteras).toBe(1);
  });

  it('las preguntas se responden con sus botones', async () => {
    const { fixture, el, store } = await abrirPagina();
    await store.abrir(5);
    store.tocar({ manzana: '5-5.a', cercana: null });
    await fixture.whenStable();
    (el.querySelector('.territorio .cerrar') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.dialogo h2')?.textContent).toContain('¿Descartar');
    (el.querySelector('.dialogo .boton.peligro') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.abiertos()).toEqual([]);
    expect(el.querySelector('.dialogo')).toBeNull();
  });

  it('el botón de ubicación va al mapa', async () => {
    const { el } = await abrirPagina();
    (el.querySelector('.lateral .icono.grande') as HTMLButtonElement).click();
    expect(vista.alternarUbicacion).toHaveBeenCalled();
  });
});
