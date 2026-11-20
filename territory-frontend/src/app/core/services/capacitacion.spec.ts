import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { Capacitacion, REVISAR_CAPACITACION_MS } from './capacitacion';

const URL = '/api/v1/reports/public/capacitacion';

describe('Capacitacion: el aviso de la app y del visor', () => {
  let servicio: Capacitacion;
  let http: HttpTestingController;

  function preparar(plataforma = 'browser') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: plataforma }],
    });
    servicio = TestBed.inject(Capacitacion);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('pregunta al abrir la pantalla, sin pasar por el service worker, y muestra desde cuándo', async () => {
    preparar();
    const soltar = servicio.vigilar();
    const pedido = http.expectOne(URL);
    expect(pedido.request.headers.get('ngsw-bypass')).toBe('true');
    pedido.flush({ activa: true, desde: '2026-11-22T19:00:00Z' });
    await Promise.resolve();
    expect(servicio.activa()).toBe(true);
    expect(servicio.desde()).toBe('2026-11-22T19:00:00Z');
    soltar();
  });

  it('vuelve a preguntar cada minuto y al volver a la app; deja de hacerlo al cerrar la última pantalla', async () => {
    vi.useFakeTimers();
    preparar();
    const soltarMapa = servicio.vigilar();
    const soltarOtra = servicio.vigilar();
    http.expectOne(URL).flush({ activa: false, desde: null });

    vi.advanceTimersByTime(REVISAR_CAPACITACION_MS);
    http.expectOne(URL).flush({ activa: true, desde: '2026-11-22T19:00:00Z' });
    await Promise.resolve();
    expect(servicio.activa()).toBe(true);

    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne(URL).flush({ activa: false, desde: '2026-11-22T19:00:00Z' });
    await Promise.resolve();
    expect(servicio.activa()).toBe(false);
    expect(servicio.desde()).toBeNull();

    soltarMapa();
    soltarMapa(); // soltar dos veces no descuenta otra pantalla
    vi.advanceTimersByTime(REVISAR_CAPACITACION_MS);
    http.expectOne(URL).flush({ activa: false, desde: null });
    soltarOtra();
    vi.advanceTimersByTime(REVISAR_CAPACITACION_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectNone(URL);
  });

  it('sin señal (o con un servidor que no lo conoce) se queda como estaba', async () => {
    preparar();
    servicio.activa.set(true);
    const soltar = servicio.vigilar();
    http.expectOne(URL).flush('no', { status: 404, statusText: 'Not Found' });
    await Promise.resolve();
    expect(servicio.activa()).toBe(true);
    soltar();
  });

  it('en el servidor (SSR) no pregunta nada', () => {
    preparar('server');
    servicio.vigilar()();
    http.expectNone(URL);
  });
});
