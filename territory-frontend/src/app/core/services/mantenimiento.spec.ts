import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { Toast } from './toast';
import { CONFIRMAR_MS, Mantenimiento, REINTENTAR_MS, TEXTOS_MANTENIMIENTO } from './mantenimiento';

const SONDA = '/api/v1/encargados/registro';

describe('Mantenimiento: «Estamos haciendo mejoras»', () => {
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  function crear(plataforma = 'browser'): Mantenimiento {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: plataforma }, { provide: Toast, useValue: toast }],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(Mantenimiento);
  }

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    http?.verify();
    vi.useRealTimers();
  });

  const caido = (status = 503) => http.expectOne(SONDA).flush({}, { status, statusText: 'Caído' });
  const responde = () => http.expectOne(SONDA).flush({ abierto: true });

  it('un corte de un segundo no muestra nada: antes de mostrarla vuelve a probar', async () => {
    const m = crear();
    m.avisarCaida();
    m.avisarCaida(); // un segundo aviso mientras se comprueba no pide dos veces
    await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
    responde();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.activo()).toBe(false);
  });

  it('si sigue caído muestra la pantalla con un texto; vuelve sola cuando el servidor responde', async () => {
    const m = crear();
    m.avisarCaida();
    await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
    caido(502);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.activo()).toBe(true);
    expect(TEXTOS_MANTENIMIENTO).toContain(m.texto());

    m.avisarCaida(); // ya está a la vista: nada nuevo
    await vi.advanceTimersByTimeAsync(REINTENTAR_MS);
    caido(504);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.activo()).toBe(true);

    await vi.advanceTimersByTimeAsync(REINTENTAR_MS);
    responde();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.activo()).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('Listo, ya puedes seguir', 3000, 'success');
    await vi.advanceTimersByTimeAsync(REINTENTAR_MS * 2);
    http.expectNone(SONDA);
  });

  it('«Intentar ahora»: si el servidor ya responde (aunque sea con otro error), se va la pantalla', async () => {
    const m = crear();
    m.avisarCaida();
    await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
    caido(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.activo()).toBe(true);
    const intento = m.reintentar();
    http.expectOne(SONDA).flush({}, { status: 404, statusText: 'No' });
    await intento;
    expect(m.activo()).toBe(false);
  });

  it('cada vez sale el texto siguiente', async () => {
    const m = crear();
    const vistos: string[] = [];
    for (let i = 0; i < TEXTOS_MANTENIMIENTO.length + 1; i++) {
      m.avisarCaida();
      await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
      caido();
      await vi.advanceTimersByTimeAsync(0);
      vistos.push(m.texto().cita);
      const intento = m.reintentar();
      responde();
      await intento;
    }
    expect(new Set(vistos.slice(0, TEXTOS_MANTENIMIENTO.length)).size).toBe(TEXTOS_MANTENIMIENTO.length);
    expect(vistos.at(-1)).toBe(vistos[0]);
  });

  it('sin almacenamiento elige uno igual', async () => {
    const leer = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const m = crear();
    m.avisarCaida();
    await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
    caido();
    await vi.advanceTimersByTimeAsync(0);
    expect(TEXTOS_MANTENIMIENTO).toContain(m.texto());
    leer.mockRestore();
    const intento = m.reintentar();
    responde();
    await intento;
  });

  it('en el servidor (SSR) no hace nada', async () => {
    const m = crear('server');
    m.avisarCaida();
    await vi.advanceTimersByTimeAsync(CONFIRMAR_MS);
    http.expectNone(SONDA);
    expect(m.activo()).toBe(false);
  });

  it('los textos son de la Traducción del Nuevo Mundo, con su cita', () => {
    expect(TEXTOS_MANTENIMIENTO.map(t => t.cita)).toEqual(['Gálatas 6:9', 'Colosenses 3:23', '1 Corintios 14:40', 'Eclesiastés 3:1', 'Eclesiastés 7:8']);
    expect(TEXTOS_MANTENIMIENTO[0].texto).toBe('Así que no dejemos de hacer lo que está bien, porque al debido tiempo cosecharemos si no nos cansamos.');
  });
});
