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
});
