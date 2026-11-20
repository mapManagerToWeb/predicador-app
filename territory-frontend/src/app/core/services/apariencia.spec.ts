import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { Apariencia, OPACIDAD_PREDICADAS_POR_DEFECTO, limpiarOpacidad, opacidadFranja } from './apariencia';

const URL = '/api/v1/reports/public/apariencia';

describe('Apariencia: la intensidad de lo predicado', () => {
  let http: HttpTestingController;

  function crear(plataforma = 'browser'): Apariencia {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: plataforma }],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(Apariencia);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => http?.verify());

  it('queda dentro de los límites y con dos decimales; la franja va más suave', () => {
    expect(limpiarOpacidad(0.7349)).toBe(0.73);
    expect(limpiarOpacidad(5)).toBe(0.95);
    expect(limpiarOpacidad(-1)).toBe(0.3);
    expect(limpiarOpacidad('0.8')).toBe(0.8);
    expect(limpiarOpacidad('x')).toBe(OPACIDAD_PREDICADAS_POR_DEFECTO);
    expect(opacidadFranja(0.6)).toBe(0.36);
  });

  it('pide la del servidor sin pasar por el service worker y la recuerda en el teléfono', async () => {
    const apariencia = crear();
    expect(apariencia.opacidadPredicadas()).toBe(OPACIDAD_PREDICADAS_POR_DEFECTO);
    const carga = apariencia.cargar();
    expect(apariencia.cargar()).toBe(carga); // no pide dos veces a la vez
    const pedido = http.expectOne(URL);
    expect(pedido.request.headers.get('ngsw-bypass')).toBe('true');
    pedido.flush({ opacidadPredicadas: 0.85 });
    await carga;
    expect(apariencia.opacidadPredicadas()).toBe(0.85);
    expect(localStorage.getItem('territorios_opacidad_predicadas')).toBe('0.85');
  });

  it('sin señal usa la que quedó guardada en el teléfono', async () => {
    localStorage.setItem('territorios_opacidad_predicadas', '0.9');
    const apariencia = crear();
    expect(apariencia.opacidadPredicadas()).toBe(0.9);
    const carga = apariencia.cargar();
    http.expectOne(URL).flush('caído', { status: 503, statusText: 'Service Unavailable' });
    await carga;
    expect(apariencia.opacidadPredicadas()).toBe(0.9);
  });

  it('una respuesta sin valor vuelve a la de siempre', async () => {
    const apariencia = crear();
    const carga = apariencia.cargar();
    http.expectOne(URL).flush({});
    await carga;
    expect(apariencia.opacidadPredicadas()).toBe(OPACIDAD_PREDICADAS_POR_DEFECTO);
  });

  it('en el servidor (SSR) no pide nada', async () => {
    const apariencia = crear('server');
    await apariencia.cargar();
    http.expectNone(URL);
  });

  it('si el almacenamiento está bloqueado, igual funciona', () => {
    const leer = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const escribir = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const apariencia = crear();
    expect(apariencia.opacidadPredicadas()).toBe(OPACIDAD_PREDICADAS_POR_DEFECTO);
    apariencia.usar(0.7);
    expect(apariencia.opacidadPredicadas()).toBe(0.7);
    leer.mockRestore();
    escribir.mockRestore();
  });
});
