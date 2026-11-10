import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { ActualizacionApp } from './actualizacion';

const LISTA: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'vieja' },
  latestVersion: { hash: 'nueva' },
};

describe('ActualizacionApp: que nadie quede con la versión vieja', () => {
  let versiones: Subject<VersionEvent>;
  let rota: Subject<unknown>;
  let sw: { isEnabled: boolean; versionUpdates: Subject<VersionEvent>; unrecoverable: Subject<unknown>; checkForUpdate: ReturnType<typeof vi.fn>; activateUpdate: ReturnType<typeof vi.fn> };
  let servicio: ActualizacionApp;
  let recargas: number;

  function crear(habilitado = true): void {
    versiones = new Subject();
    rota = new Subject();
    sw = {
      isEnabled: habilitado,
      versionUpdates: versiones,
      unrecoverable: rota,
      checkForUpdate: vi.fn().mockResolvedValue(true),
      activateUpdate: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }] });
    servicio = TestBed.inject(ActualizacionApp);
    recargas = 0;
    vi.spyOn(servicio as unknown as { recargar: () => void }, 'recargar').mockImplementation(() => {
      recargas++;
    });
    servicio.iniciar();
  }

  const esperar = () => new Promise(r => setTimeout(r, 0));
  function ponerVisibilidad(estado: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    ponerVisibilidad('visible');
  });

  it('pregunta por una versión nueva al abrir', () => {
    crear();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('recién abierta (sin tocar nada): se actualiza sola', async () => {
    crear();
    versiones.next(LISTA);
    await esperar();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(recargas).toBe(1);
  });

  it('si el hermano ya está usando la app: solo muestra el aviso', async () => {
    crear();
    window.dispatchEvent(new Event('pointerdown'));
    versiones.next(LISTA);
    await esperar();
    expect(servicio.hayVersionNueva()).toBe(true);
    expect(recargas).toBe(0);

    await servicio.actualizar();
    expect(recargas).toBe(1);
  });

  it('al volver a la app después de un rato, se actualiza sola', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    crear();
    window.dispatchEvent(new Event('keydown'));
    versiones.next(LISTA);
    await esperar();
    expect(recargas).toBe(0);

    ponerVisibilidad('hidden');
    vi.setSystemTime(Date.now() + 2 * 60_000);
    ponerVisibilidad('visible');
    await esperar();
    expect(recargas).toBe(1);
  });

  it('al volver a los pocos segundos no recarga (podría estar a medio enviar)', async () => {
    crear();
    window.dispatchEvent(new Event('pointerdown'));
    versiones.next(LISTA);
    ponerVisibilidad('hidden');
    ponerVisibilidad('visible');
    await esperar();
    expect(recargas).toBe(0);
  });

  it('nunca recarga sola dos veces seguidas', async () => {
    sessionStorage.setItem('app-recarga-por-version', String(Date.now()));
    crear();
    versiones.next(LISTA);
    await esperar();
    expect(recargas).toBe(0);
    expect(servicio.hayVersionNueva()).toBe(true);
  });

  it('si la copia guardada quedó rota, recarga', () => {
    crear();
    rota.next({ type: 'UNRECOVERABLE_STATE', reason: 'x' });
    expect(recargas).toBe(1);
  });

  it('sin service worker (desarrollo) no hace nada', () => {
    crear(false);
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
  });
});
