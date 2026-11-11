import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { ImagenAvance } from './imagen-avance';

describe('ImagenAvance', () => {
  let api: { estadoPublico: ReturnType<typeof vi.fn>; ciclos: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    api = {
      estadoPublico: vi.fn().mockResolvedValue([
        { territorio: 1, ultimoTrabajo: '2026-11-05T12:00:00Z', estado: 'completed' },
        { territorio: 2, ultimoTrabajo: '2026-11-06T12:00:00Z', estado: 'incomplete' },
      ]),
      ciclos: vi.fn().mockResolvedValue([
        { id: 2, inicio: '2026-11-03T03:00:00Z', fin: null, nota: null, resumen: null },
        { id: 1, inicio: '2026-08-01T03:00:00Z', fin: '2026-11-03T03:00:00Z', nota: null, resumen: null },
      ]),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    const store = TestBed.inject(AdminStore);
    vi.spyOn(store, 'cargarManzanas').mockResolvedValue();
    store.manzanas.set({
      type: 'FeatureCollection',
      features: [1, 2, 3].map(t => ({
        type: 'Feature',
        id: t,
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { id: t, territorio: t, nombre: `${t}.a`, areaM2: 100, valida: true },
      })),
    });
  });

  async function abrir() {
    const fixture = TestBed.createComponent(ImagenAvance);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.nativeElement.textContent).not.toContain('Preparando la imagen'));
    fixture.detectChanges();
    return fixture;
  }

  it('carga cómo va la vuelta y dice desde cuándo', async () => {
    const fixture = await abrir();
    expect(api.estadoPublico).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('(desde el 3 de noviembre).');
  });

  it('recuerda lo escrito y avisa si la fecha de la meta ya pasó', async () => {
    const fixture = await abrir();
    const [titulo, nombre, fecha] = ['input[maxlength="40"]', 'input[placeholder="la asamblea"]', 'input[type="date"]'].map(
      s => fixture.nativeElement.querySelector(s) as HTMLInputElement,
    );
    for (const [campo, valor] of [[titulo, '¡Vamos!'], [nombre, 'la asamblea'], [fecha, '2020-01-01']] as const) {
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    TestBed.tick();
    expect(fixture.nativeElement.textContent).toContain('Esa fecha ya pasó');
    expect(JSON.parse(localStorage.getItem('territorios_imagen_avance')!)).toEqual(
      expect.objectContaining({ titulo: '¡Vamos!', metaNombre: 'la asamblea', metaFecha: '2020-01-01' }),
    );
  });

  it('se cierra con «Cerrar» y con Escape', async () => {
    const fixture = await abrir();
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    (fixture.nativeElement.querySelector('.adm-actions .adm-btn') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cerrar).toHaveBeenCalledTimes(2);
  });

  it('si no carga el estado, lo dice', async () => {
    api.estadoPublico.mockRejectedValue(new Error('caído'));
    const fixture = await abrir();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  describe('descargar y compartir', () => {
    let toast: { show: ReturnType<typeof vi.fn> };
    let clics: string[];
    let blob: Blob | null;

    beforeEach(() => {
      toast = TestBed.inject(Toast) as unknown as { show: ReturnType<typeof vi.fn> };
      clics = [];
      blob = new Blob(['png'], { type: 'image/png' });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(listo => listo(blob));
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clics.push(this.download);
      });
      URL.createObjectURL = vi.fn(() => 'blob:imagen');
      URL.revokeObjectURL = vi.fn();
      // El logo se carga bien y el navegador sabe compartir archivos.
      Object.defineProperty(HTMLImageElement.prototype, 'decode', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
      Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete (navigator as { canShare?: unknown }).canShare;
      delete (navigator as { share?: unknown }).share;
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    });

    const boton = (fixture: { nativeElement: HTMLElement }, texto: string) =>
      [...fixture.nativeElement.querySelectorAll('button')].find(b => b.textContent?.trim() === texto) as HTMLButtonElement;

    it('descarga el PNG con el día y la forma en el nombre', async () => {
      const fixture = await abrir();
      boton(fixture, 'Para el estado').click();
      fixture.detectChanges();
      boton(fixture, 'Descargar imagen').click();
      await vi.waitFor(() => expect(clics).toHaveLength(1));
      expect(clics[0]).toMatch(/^avance-territorios-\d{4}-\d{2}-\d{2}-estado\.png$/);
    });

    it('si no se pudo armar la imagen, lo avisa', async () => {
      blob = null;
      const fixture = await abrir();
      boton(fixture, 'Descargar imagen').click();
      await vi.waitFor(() => expect(toast.show).toHaveBeenCalledWith('No se pudo armar la imagen', 4000, 'error'));
      expect(clics).toHaveLength(0);
    });

    it('comparte el archivo; cerrar el menú no hace nada más', async () => {
      const fixture = await abrir();
      boton(fixture, 'Compartir').click();
      await vi.waitFor(() => expect(navigator.share).toHaveBeenCalledWith({ files: [expect.any(File)] }));
      vi.mocked(navigator.share).mockRejectedValue(new DOMException('cerrado', 'AbortError'));
      boton(fixture, 'Compartir').click();
      await new Promise(r => setTimeout(r, 0));
      expect(clics).toHaveLength(0);
    });

    it('si compartir falla de verdad, la descarga', async () => {
      vi.mocked(navigator.share).mockRejectedValue(new Error('no se puede'));
      const fixture = await abrir();
      boton(fixture, 'Compartir').click();
      await vi.waitFor(() => expect(clics).toHaveLength(1));
    });

    it('sin poder preguntar si se puede compartir, no muestra el botón', async () => {
      Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => { throw new Error('no'); }), configurable: true });
      const fixture = await abrir();
      expect(boton(fixture, 'Compartir')).toBeUndefined();
    });
  });

  it('con lo guardado dañado usa los textos de siempre, y sin ciclos no dice desde cuándo', async () => {
    localStorage.setItem('territorios_imagen_avance', '{dañado');
    api.ciclos.mockRejectedValue(new Error('sin ciclos'));
    const fixture = await abrir();
    expect((fixture.nativeElement.querySelector('input[maxlength="40"]') as HTMLInputElement).value).toBe('¡Así vamos, hermanos!');
    expect(fixture.nativeElement.textContent).toContain('empezó la vuelta. Descárgala');
  });
});
