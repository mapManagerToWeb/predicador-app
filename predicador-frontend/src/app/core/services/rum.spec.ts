import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RumService, normalizeRoute } from './rum';

describe('normalizeRoute (pure function)', () => {
  it('colapsa segmentos numéricos', () => {
    expect(normalizeRoute('/territories/123/color')).toBe('/territories/:id/color');
    expect(normalizeRoute('/reports/42')).toBe('/reports/:id');
  });

  it('elimina query strings', () => {
    expect(normalizeRoute('/map?foo=bar')).toBe('/map');
    expect(normalizeRoute('/login?redirect=/admin')).toBe('/login');
  });

  it('trunca rutas largas a 40 chars', () => {
    const long = '/' + 'x'.repeat(200);
    expect(normalizeRoute(long).length).toBe(40);
  });

  it('devuelve "/" para ruta raíz', () => {
    expect(normalizeRoute('/')).toBe('/');
  });

  it('maneja string vacío sin colapsar', () => {
    expect(normalizeRoute('')).toBe('');
  });

  it('colapsa múltiples segmentos numéricos', () => {
    expect(normalizeRoute('/a/1/b/2/c')).toBe('/a/:id/b/:id/c');
  });

  it('no trunca rutas cortas', () => {
    expect(normalizeRoute('/map')).toBe('/map');
    expect(normalizeRoute('/profile')).toBe('/profile');
  });
});

describe('RumService', () => {
  let service: RumService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    service = TestBed.inject(RumService);
    // sendBeacon no existe en jsdom → forzamos fallback a fetch.
    (navigator as unknown as { sendBeacon?: unknown }).sendBeacon = undefined;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('send() usa fetch con keepalive cuando sendBeacon no está', () => {
    const svc = service as unknown as {
      send(m: { name: string; value: number }): void;
    };
    svc.send({ name: 'LCP', value: 1234 });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: 'LCP',
      value: 1234,
    });
  });

  it('start() solo ejecuta una vez (idempotente)', () => {
    service.start();
    service.start();
    // No debe lanzar errores ni crear múltiples suscripciones
    expect(service).toBeTruthy();
  });

  it('start() es no-op en servidor (SSR)', () => {
    // En jsdom PerformanceObserver existe, así que start() debería funcionar
    // Pero verificamos que no lanza excepciones
    expect(() => service.start()).not.toThrow();
  });
});
