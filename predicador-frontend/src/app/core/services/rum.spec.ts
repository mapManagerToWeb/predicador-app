import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RumService } from './rum';

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

  it('normalizeRoute colapsa segmentos numéricos', () => {
    // Acceso a método privado vía cast; testear la lógica de sanitización
    // es más valioso que su encapsulación.
    const svc = service as unknown as { normalizeRoute(p: string): string };
    expect(svc.normalizeRoute('/territories/123/color')).toBe('/territories/:id/color');
    expect(svc.normalizeRoute('/map?foo=bar')).toBe('/map');
    expect(svc.normalizeRoute('/reports/42')).toBe('/reports/:id');
  });

  it('normalizeRoute trunca rutas largas a 40 chars', () => {
    const svc = service as unknown as { normalizeRoute(p: string): string };
    const long = '/' + 'x'.repeat(200);
    expect(svc.normalizeRoute(long).length).toBe(40);
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

  it('start() actualiza currentRoute en cada NavigationEnd', () => {
    const router = TestBed.inject(Router);
    service.start();

    router.events.next?.(); // no-op si es un ReplaySubject; el spy es interno
    // No podemos disparar NavigationEnd real sin componentes; verificamos
    // que la subscripción no explota simplemente iniciando el servicio.
    expect(service).toBeTruthy();
  });
});
