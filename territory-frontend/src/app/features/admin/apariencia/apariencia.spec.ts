import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apariencia } from '../../../core/services/apariencia';
import { Toast } from '../../../core/services/toast';
import { AdminApi } from '../services/admin-api';
import { AparienciaPanel } from './apariencia';

describe('AparienciaPanel: la intensidad de lo predicado', () => {
  let guardada: ReturnType<typeof signal<number>>;
  let apariencia: { opacidadPredicadas: ReturnType<typeof signal<number>>; cargar: ReturnType<typeof vi.fn>; usar: ReturnType<typeof vi.fn> };
  let api: { setOpacidadPredicadas: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    guardada = signal(0.6);
    apariencia = { opacidadPredicadas: guardada, cargar: vi.fn().mockResolvedValue(undefined), usar: vi.fn((v: number) => guardada.set(v)) };
    api = { setOpacidadPredicadas: vi.fn(async (v: number) => v) };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AparienciaPanel],
      providers: [
        { provide: Apariencia, useValue: apariencia },
        { provide: AdminApi, useValue: api },
        { provide: Toast, useValue: toast },
      ],
    });
  });

  async function crear() {
    const fixture = TestBed.createComponent(AparienciaPanel);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const boton = (texto: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
    const rango = el.querySelector('input[type=range]') as HTMLInputElement;
    return { fixture, el, boton, rango };
  }

  it('muestra la guardada, la vista previa cambia al mover y se guarda', async () => {
    const { fixture, el, boton, rango } = await crear();
    expect(apariencia.cargar).toHaveBeenCalled();
    expect(el.textContent).toContain('60 %');
    expect(boton('Guardar').disabled).toBe(true);

    rango.value = '85';
    rango.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('85 %');
    expect((el.querySelector('.ap-manzana') as HTMLElement).style.background).toContain('0.85');
    expect(boton('Guardar').disabled).toBe(false);

    boton('Guardar').click();
    await fixture.whenStable();
    expect(api.setOpacidadPredicadas).toHaveBeenCalledWith(0.85);
    expect(apariencia.usar).toHaveBeenCalledWith(0.85);
    expect(toast.show).toHaveBeenCalledWith('Guardado: los hermanos lo verán al abrir el mapa', 4000, 'success');
    expect(boton('Guardar').disabled).toBe(true);
  });

  it('«La de siempre» vuelve al valor por defecto; si guardar falla, lo dice', async () => {
    guardada.set(0.9);
    const { fixture, el, boton } = await crear();
    expect(el.textContent).toContain('90 %');
    boton('La de siempre').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('60 %');

    api.setOpacidadPredicadas.mockRejectedValueOnce(new Error('caído'));
    boton('Guardar').click();
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('No se pudo guardar la intensidad', 5000, 'error');
  });

  it('si la guardada llega del servidor después, el control la muestra (salvo que ya se estuviera cambiando)', async () => {
    const { fixture, el, rango } = await crear();
    guardada.set(0.75);
    await fixture.whenStable();
    expect(el.textContent).toContain('75 %');

    rango.value = '40';
    rango.dispatchEvent(new Event('input'));
    guardada.set(0.5);
    await fixture.whenStable();
    expect(el.textContent).toContain('40 %');
  });
});
