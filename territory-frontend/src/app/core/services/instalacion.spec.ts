import { TestBed } from '@angular/core/testing';
import { CLAVE_AHORA_NO, CLAVE_INSTALADA, type EventoInstalar, Instalacion, tipoDeTelefono } from './instalacion';

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function eventoInstalar(outcome: 'accepted' | 'dismissed' = 'accepted'): EventoInstalar {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as EventoInstalar;
  Object.assign(e, { prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome }) });
  return e;
}

describe('tipoDeTelefono', () => {
  it('distingue Android, iPhone (Safari, Chrome, otro) e iPad; un computador no cuenta', () => {
    expect(tipoDeTelefono({ userAgent: UA.android, maxTouchPoints: 5 })).toBe('android');
    expect(tipoDeTelefono({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe('iphone-safari');
    expect(tipoDeTelefono({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe('iphone-chrome');
    expect(tipoDeTelefono({ userAgent: UA.iphoneFirefox, maxTouchPoints: 5 })).toBe('iphone-otro');
    expect(tipoDeTelefono({ userAgent: UA.ipad, maxTouchPoints: 5 })).toBe('iphone-safari');
    expect(tipoDeTelefono({ userAgent: UA.ipad, maxTouchPoints: 0 })).toBeNull();
    expect(tipoDeTelefono({ userAgent: UA.pc, maxTouchPoints: 0 })).toBeNull();
  });
});

describe('Instalacion: ofrecer instalar solo si no está instalada', () => {
  let modo: string;

  function preparar(userAgent: string, opciones: { modo?: string; standalone?: boolean } = {}): Instalacion {
    modo = opciones.modo ?? 'browser';
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent });
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => opciones.standalone });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === `(display-mode: ${modo})` }));
    const servicio = TestBed.inject(Instalacion);
    servicio.iniciar();
    return servicio;
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>)['__eventoInstalar'];
  });

  it('abierta desde el ícono: no muestra nada y anota que está instalada', () => {
    const s = preparar(UA.android, { modo: 'standalone' });
    window.dispatchEvent(eventoInstalar());
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_INSTALADA)).toBe('1');
  });

  it('iPhone abierta desde el ícono (navigator.standalone): no muestra nada', () => {
    const s = preparar(UA.iphoneSafari, { standalone: true });
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_INSTALADA)).toBe('1');
  });

  it('Android sin instalar: espera a que Chrome lo permita y entonces muestra «Instalar»', () => {
    const s = preparar(UA.android);
    expect(s.aviso()).toBeNull();
    const e = eventoInstalar();
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(s.aviso()).toBe('android');
    expect(s.llegoTarde()).toBe(false);
  });

  it('Android: toma el aviso que llegó antes que la app (script de index.html)', () => {
    (window as unknown as Record<string, unknown>)['__eventoInstalar'] = eventoInstalar();
    const s = preparar(UA.android);
    expect(s.aviso()).toBe('android');
  });

  it('Android: si ya estaba tocando la app cuando llegó, queda marcado como tarde', () => {
    const s = preparar(UA.android);
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(eventoInstalar());
    expect(s.llegoTarde()).toBe(true);
  });

  it('Android: «Instalar» abre la ventana del teléfono y, si acepta, no vuelve a ofrecerse', async () => {
    const s = preparar(UA.android);
    const e = eventoInstalar('accepted');
    window.dispatchEvent(e);
    expect(await s.instalar()).toBe('instalada');
    expect(e.prompt).toHaveBeenCalled();
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_INSTALADA)).toBe('1');
    expect(await s.instalar()).toBe('no-disponible');
  });

  it('Android: si cancela la ventana del teléfono, cuenta como «Ahora no»', async () => {
    const s = preparar(UA.android);
    window.dispatchEvent(eventoInstalar('dismissed'));
    expect(await s.instalar()).toBe('cancelada');
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_AHORA_NO)).not.toBeNull();
  });

  it('Android: si el navegador falla al abrir la ventana, también cuenta como «Ahora no»', async () => {
    const s = preparar(UA.android);
    const e = eventoInstalar();
    (e.prompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ya usado'));
    window.dispatchEvent(e);
    expect(await s.instalar()).toBe('cancelada');
  });

  it('Android: si se instala por el menú del navegador, el aviso se va solo', () => {
    const s = preparar(UA.android);
    window.dispatchEvent(eventoInstalar());
    window.dispatchEvent(new Event('appinstalled'));
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_INSTALADA)).toBe('1');
  });

  it('una vez abierta desde el ícono, en el navegador ya no se ofrece', () => {
    localStorage.setItem(CLAVE_INSTALADA, '1');
    const s = preparar(UA.android);
    window.dispatchEvent(eventoInstalar());
    expect(s.aviso()).toBeNull();
  });

  it('iPhone en Safari: muestra los pasos; «Ya la tengo instalada» lo apaga para siempre', () => {
    const s = preparar(UA.iphoneSafari);
    expect(s.aviso()).toBe('iphone-safari');
    s.marcarInstalada();
    expect(s.aviso()).toBeNull();
    expect(localStorage.getItem(CLAVE_INSTALADA)).toBe('1');
  });

  it('iPhone con Chrome u otro navegador: el aviso que le corresponde', () => {
    expect(preparar(UA.iphoneChrome).aviso()).toBe('iphone-chrome');
  });

  it('en un computador no se ofrece nada', () => {
    expect(preparar(UA.pc).aviso()).toBeNull();
  });

  it('«Ahora no»: no vuelve hasta pasados 3 días', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    localStorage.setItem(CLAVE_AHORA_NO, String(Date.now() - 2 * 24 * 60 * 60_000));
    expect(preparar(UA.iphoneSafari).aviso()).toBeNull();

    TestBed.resetTestingModule();
    localStorage.setItem(CLAVE_AHORA_NO, String(Date.now() - 4 * 24 * 60 * 60_000));
    expect(preparar(UA.iphoneSafari).aviso()).toBe('iphone-safari');
  });

  it('«Ahora no» guarda el momento y esconde el aviso', () => {
    const s = preparar(UA.iphoneSafari);
    s.ahoraNo();
    expect(s.aviso()).toBeNull();
    expect(Number(localStorage.getItem(CLAVE_AHORA_NO))).toBeGreaterThan(0);
  });
});
