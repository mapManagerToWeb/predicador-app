import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { WhatsAppService } from '../../core/services/whatsapp';
import { Toast } from '../../core/services/toast';
import { MapPage } from './map';
import { MapaStore } from './mapa.store';
import { MODO_PRACTICA } from '../../core/map/modo-practica';

const vista = {
  mostrar: vi.fn(),
  encuadrar: vi.fn(),
  encuadrarTodo: vi.fn(),
  limitar: vi.fn(),
  mostrarLados: vi.fn(),
  capturar: vi.fn(),
  alternarUbicacion: vi.fn(),
  cambiarFondo: vi.fn(),
  ajustarMargenes: vi.fn(),
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
    configurar();
  });

  function configurar(practica = false): void {
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
        { provide: AuthTokenService, useValue: { hasToken: () => true, logout: vi.fn() } },
        { provide: Toast, useValue: { show: vi.fn() } },
        ...(practica ? [{ provide: MODO_PRACTICA, useValue: true }] : []),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  it('sin territorio abierto explica cómo empezar', async () => {
    const { el } = await abrirPagina();
    expect(el.querySelector('.panel')?.textContent).toContain('Busca tu territorio');
    expect(el.querySelector('app-tutorial')).toBeNull();
  });

  it('el tutorial no se abre solo, ni la primera vez: solo con el botón «?»', async () => {
    const { fixture, el } = await abrirPagina(false);
    expect(el.querySelector('app-tutorial')).toBeNull();
    (el.querySelector('[data-tutorial="ayuda"]') as HTMLButtonElement).click();
    await fixture.whenStable();
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

  it('en modo práctica avisa que nada es real y no ofrece cerrar sesión', async () => {
    TestBed.resetTestingModule();
    configurar(true);
    const { el } = await abrirPagina();
    expect(el.querySelector('.aviso-practica')?.textContent).toContain('Modo práctica');
    const iconos = el.querySelectorAll('header .icono');
    expect(iconos[iconos.length - 1].getAttribute('aria-label')).toBe('Salir de la práctica');
  });
  interface VistaPagina {
    busqueda: { set: (v: string) => void; (): string };
    fondo: { set: (v: string) => void; (): string };
    oscuro: { set: (v: boolean) => void; (): boolean };
    verTutorial: { set: (v: boolean) => void; (): boolean };
    otrosDias: { set: (v: boolean) => void; (): boolean };
    ubicacion: { (): string };
    sugerencias(): number[];
    alternarFondo(): void;
    alternarTema(): void;
    abrirTutorial(): void;
    cerrarTutorial(): void;
    cambiarModo(m: string): void;
    cambiarTurno(t: string): void;
    elegirDia(atras: number): void;
    elegir(numero: number): Promise<void>;
    ocultarSugerencias(): void;
    hace(fecha: string | null): string;
    fechaCorta(fecha: string | null): string;
    salir(): void;
    reintentar(): void;
    medirPanel(panel: HTMLElement): void;
  }

  function comoPagina(fixture: { componentInstance: unknown }): VistaPagina {
    return fixture.componentInstance as unknown as VistaPagina;
  }

  it('lee el fondo y el tema guardados al abrir', async () => {
    localStorage.setItem('territory_satellite', 'true');
    localStorage.setItem('territory_theme', 'dark');
    const { fixture } = await abrirPagina();
    const page = comoPagina(fixture);
    expect(page.fondo()).toBe('satelite');
    expect(page.oscuro()).toBe(true);
  });

  it('alterna fondo y tema guardando la preferencia', async () => {
    const { fixture } = await abrirPagina();
    const page = comoPagina(fixture);

    page.alternarFondo();
    expect(page.fondo()).toBe('satelite');
    expect(localStorage.getItem('territory_satellite')).toBe('true');
    expect(vista.cambiarFondo).toHaveBeenCalledWith('satelite');

    page.alternarFondo();
    expect(page.fondo()).toBe('mapa');

    page.alternarTema();
    expect(page.oscuro()).toBe(true);
    expect(localStorage.getItem('territory_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    page.alternarTema();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sigue funcionando si el almacenamiento no está disponible', async () => {
    localStorage.setItem('mapa.tutorial.visto', '1');
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    try {
      const fixture = TestBed.createComponent(MapPage);
      await fixture.whenStable();
      await Promise.resolve();
      http.expectOne(r => r.url.endsWith('/reports/public/estado')).flush([]);
      await fixture.whenStable();
      const page = comoPagina(fixture);
      expect(page.fondo()).toBe('mapa');
      page.alternarFondo();
      expect(page.fondo()).toBe('satelite');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('sugiere territorios mientras se escribe y los elige', async () => {
    const { fixture, store } = await abrirPagina();
    const page = comoPagina(fixture);
    expect(page.sugerencias()).toEqual([]);

    page.busqueda.set('5');
    expect(page.sugerencias()).toContain(5);

    await page.elegir(5);
    expect(store.abiertos()).toContain(5);
  });

  it('oculta las sugerencias y cambia modo, turno y día', async () => {
    const { fixture, store } = await abrirPagina();
    const page = comoPagina(fixture);
    page.ocultarSugerencias();
    await new Promise(r => setTimeout(r, 200));

    page.cambiarModo('calles');
    expect(store.modo()).toBe('calles');
    page.cambiarTurno('tarde');
    expect(store.predicacion()).toBe('tarde');

    page.otrosDias.set(true);
    page.elegirDia(0);
    expect(store.diaAtras()).toBe(0);
    expect(page.otrosDias()).toBe(false);
    page.otrosDias.set(true);
    page.elegirDia(5);
    expect(store.diaAtras()).toBe(5);
  });

  it('escribe hace cuánto y la fecha corta', async () => {
    const { fixture } = await abrirPagina();
    const page = comoPagina(fixture);
    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    expect(page.hace(null)).toBe('');
    expect(page.hace(new Date().toISOString())).toBe('hoy');
    expect(page.hace(dias(1))).toBe('ayer');
    expect(page.hace(dias(5))).toBe('hace 5 días');
    expect(page.hace(dias(60))).toMatch(/meses/);
    expect(page.fechaCorta(null)).toBe('');
    expect(page.fechaCorta('2026-11-04T12:00:00Z')).toContain('noviembre');
  });

  it('abre y cierra el tutorial', async () => {
    const { fixture } = await abrirPagina();
    const page = comoPagina(fixture);
    page.abrirTutorial();
    expect(page.verTutorial()).toBe(true);
    page.cerrarTutorial();
    expect(page.verTutorial()).toBe(false);
  });

  it('conecta los avisos del mapa con el store y el toast', async () => {
    const { fixture } = await abrirPagina();
    const store = fixture.debugElement.injector.get(MapaStore);
    const toast = fixture.debugElement.injector.get(Toast);
    const { MapaVista } = await import('./mapa-vista');
    const opciones = (MapaVista.crear as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][4] as {
      alTocar: (t: { manzana: string; cercana: null }) => void;
      alTocarLado: (i: number) => void;
      alCambiarUbicacion: (e: string, error: string | null) => void;
      alSinRumbo: (m: string) => void;
    };
    await store.abrir(5);
    opciones.alTocar({ manzana: '5-5.a', cercana: null });
    expect(store.resumenes()[0].enteras).toBe(1);
    opciones.alTocarLado(0);
    opciones.alCambiarUbicacion('activa', null);
    expect(comoPagina(fixture).ubicacion()).toBe('activa');
    opciones.alCambiarUbicacion('apagada', 'denegada');
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Permiso de ubicación denegado'), 5000, 'warning');
    opciones.alCambiarUbicacion('apagada', 'otro');
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('No se pudo obtener tu ubicación'), 3000, 'warning');
    opciones.alSinRumbo('sin-brujula');
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'warning');
  });

  it('ajusta los márgenes del mapa según el panel', async () => {
    const { fixture } = await abrirPagina();
    const page = comoPagina(fixture);
    const panel = document.createElement('div');
    panel.getBoundingClientRect = () => ({ top: 100, left: 0, right: 400, bottom: 800, width: 400, height: 700 }) as DOMRect;
    page.medirPanel(panel);
    expect(vista.ajustarMargenes).toHaveBeenCalledWith(expect.objectContaining({ derecha: 0 }));

    panel.getBoundingClientRect = () => ({ top: 0, left: 800, right: 1000, bottom: 600, width: 100, height: 600 }) as DOMRect;
    page.medirPanel(panel);
    expect(vista.ajustarMargenes).toHaveBeenCalledWith(expect.objectContaining({ abajo: 0 }));
  });

  it('reintenta iniciar el mapa', async () => {
    const { fixture, store } = await abrirPagina();
    const cargar = vi.spyOn(store, 'cargar');
    comoPagina(fixture).reintentar();
    await Promise.resolve();
    expect(cargar).toHaveBeenCalled();
  });

  it('cerrar sesión pide confirmación y limpia la sesión', async () => {
    const { fixture, store } = await abrirPagina();
    const page = comoPagina(fixture);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const perfil = TestBed.inject(Profile);
    const authToken = TestBed.inject(AuthTokenService);

    page.salir();
    expect(store.pregunta()?.titulo).toContain('Cerrar sesión');
    store.pregunta()?.alConfirmar();
    expect(perfil.clear).toHaveBeenCalled();
    expect(authToken.logout).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });

  it('en modo práctica salir no cierra la sesión real', async () => {
    TestBed.resetTestingModule();
    configurar(true);
    const { fixture } = await abrirPagina();
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const authToken = TestBed.inject(AuthTokenService);
    comoPagina(fixture).salir();
    expect(authToken.logout).not.toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/map']);
  });

});
