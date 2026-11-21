import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AvisoInstalar } from './aviso-instalar';
import { type AvisoInstalar as TipoAviso, Instalacion } from '../services/instalacion';
import { Toast } from '../services/toast';

@Component({ template: '' })
class Vacia {}

describe('AvisoInstalar: la hoja «Instala Territorios en tu teléfono»', () => {
  let aviso: ReturnType<typeof signal<TipoAviso | null>>;
  let llegoTarde: ReturnType<typeof signal<boolean>>;
  let instalacion: { aviso: typeof aviso; llegoTarde: typeof llegoTarde; instalar: ReturnType<typeof vi.fn>; ahoraNo: ReturnType<typeof vi.fn>; marcarInstalada: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  async function abrir(ruta: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AvisoInstalar);
    await TestBed.inject(Router).navigateByUrl(ruta);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const botones = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim());
  const boton = (el: HTMLElement, texto: string) =>
    Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === texto) as HTMLButtonElement;

  beforeEach(() => {
    aviso = signal<TipoAviso | null>(null);
    llegoTarde = signal(false);
    instalacion = { aviso, llegoTarde, instalar: vi.fn().mockResolvedValue('instalada'), ahoraNo: vi.fn(), marcarInstalada: vi.fn() };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AvisoInstalar],
      providers: [
        provideRouter([{ path: '**', component: Vacia }]),
        { provide: Instalacion, useValue: instalacion },
        { provide: Toast, useValue: toast },
      ],
    });
  });

  it('sin aviso no muestra nada', async () => {
    const el = await abrir('/login');
    expect(el.querySelector('.hoja')).toBeNull();
  });

  it('Android: botón «Instalar»; al instalar avisa dónde quedó el ícono', async () => {
    aviso.set('android');
    const el = await abrir('/login');
    expect(el.querySelector('h2')?.textContent).toContain('Instala Territorios');
    expect(botones(el)).toEqual(['Instalar', 'Ahora no']);
    boton(el, 'Instalar').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(instalacion.instalar).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('pantalla de inicio'), 6000, 'success');

    boton(el, 'Ahora no').click();
    expect(instalacion.ahoraNo).toHaveBeenCalled();
  });

  it('Android: si cancela no muestra mensaje', async () => {
    aviso.set('android');
    instalacion.instalar.mockResolvedValue('cancelada');
    const el = await abrir('/login');
    boton(el, 'Instalar').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('iPhone en Safari: los 3 pasos y «Ya la tengo instalada»', async () => {
    aviso.set('iphone-safari');
    const el = await abrir('/map');
    expect(el.querySelectorAll('.pasos li')).toHaveLength(3);
    expect(el.textContent).toContain('Agregar a inicio');
    expect(el.textContent).toContain('···');
    boton(el, 'Ya la tengo instalada').click();
    expect(instalacion.marcarInstalada).toHaveBeenCalled();
    boton(el, 'Entendido').click();
    expect(instalacion.ahoraNo).toHaveBeenCalled();
  });

  it('iPhone con Chrome: el botón Compartir está arriba', async () => {
    aviso.set('iphone-chrome');
    const el = await abrir('/login');
    expect(el.textContent).toContain('al lado de la dirección');
  });

  it('iPhone con otro navegador: copia el enlace para abrirlo en Safari', async () => {
    aviso.set('iphone-otro');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const el = await abrir('/login');
    boton(el, 'Copiar el enlace').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(location.origin);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Safari'), 6000, 'success');

    writeText.mockRejectedValue(new Error('sin permiso'));
    boton(el, 'Copiar el enlace').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.show).toHaveBeenLastCalledWith(expect.stringContaining(location.origin), 8000, 'info');
  });

  it('no aparece en el registro, el visor, la práctica ni el panel', async () => {
    aviso.set('iphone-safari');
    for (const ruta of ['/profile', '/visor', '/practice', '/admin/resumen']) {
      const el = await abrir(ruta);
      expect(el.querySelector('.hoja')).toBeNull();
    }
  });

  it('en el mapa no tapa la pantalla si llegó cuando el hermano ya estaba usándolo', async () => {
    aviso.set('android');
    llegoTarde.set(true);
    expect((await abrir('/map')).querySelector('.hoja')).toBeNull();
    expect((await abrir('/login')).querySelector('.hoja')).not.toBeNull();
  });
});
