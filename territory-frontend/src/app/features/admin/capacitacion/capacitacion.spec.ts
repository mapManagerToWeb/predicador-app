import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../core/services/toast';
import type { EstadoCapacitacion } from '../admin.models';
import { AdminStore } from '../services/admin-store';
import { AdminUi } from '../services/admin-ui';
import { CapacitacionPanel, REFRESCO_CAPACITACION_MS } from './capacitacion';

const enCurso = (n: number): EstadoCapacitacion => ({
  activa: true,
  desde: '2026-11-22T19:00:00Z',
  pruebas: Array.from({ length: n }, (_, i) => ({
    id: 200 + i,
    fecha: '2026-11-22T19:10:00Z',
    territorio: 15 + i,
    encargado: i === 0 ? null : 'Juan Pérez',
    estado: i === 1 ? 'completed' : 'incomplete',
    origen: 'salida',
  })),
});

describe('CapacitacionPanel', () => {
  let store: {
    capacitacion: ReturnType<typeof import('@angular/core').signal<EstadoCapacitacion | null>>;
    cargarCapacitacion: ReturnType<typeof vi.fn>;
    empezarCapacitacion: ReturnType<typeof vi.fn>;
    terminarCapacitacion: ReturnType<typeof vi.fn>;
  };
  let confirmar: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const { signal } = await import('@angular/core');
    store = {
      capacitacion: signal<EstadoCapacitacion | null>(null),
      cargarCapacitacion: vi.fn().mockResolvedValue(undefined),
      empezarCapacitacion: vi.fn().mockImplementation(async () => store.capacitacion.set(enCurso(0))),
      terminarCapacitacion: vi.fn().mockResolvedValue(3),
    };
    confirmar = vi.fn().mockResolvedValue(true);
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CapacitacionPanel],
      providers: [
        { provide: AdminStore, useValue: store },
        { provide: AdminUi, useValue: { confirmar } },
        { provide: Toast, useValue: toast },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  async function crear(vista: 'barra' | 'tarjeta') {
    const fixture = TestBed.createComponent(CapacitacionPanel);
    fixture.componentRef.setInput('vista', vista);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const boton = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;

  it('la barra no aparece sin capacitación y la tarjeta avisa si el servidor no la tiene', async () => {
    const barra = await crear('barra');
    expect(barra.el.textContent?.trim()).toBe('');
    const tarjeta = await crear('tarjeta');
    expect(tarjeta.el.textContent).toContain('cuando el servidor esté actualizado');
    expect(store.cargarCapacitacion).toHaveBeenCalled();
  });

  it('empieza la capacitación después de confirmar', async () => {
    store.capacitacion.set({ activa: false, desde: null, pruebas: [] });
    const { fixture, el } = await crear('tarjeta');
    boton(el, 'Empezar capacitación').click();
    await fixture.whenStable();
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Empezar' }));
    expect(store.empezarCapacitacion).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Capacitación en curso', 3000, 'success');
    expect(el.textContent).toContain('ningún reporte de prueba todavía');
  });

  it('si no se confirma, no empieza; si falla, lo dice', async () => {
    store.capacitacion.set({ activa: false, desde: null, pruebas: [] });
    const { fixture, el } = await crear('tarjeta');
    confirmar.mockResolvedValueOnce(false);
    boton(el, 'Empezar capacitación').click();
    await fixture.whenStable();
    expect(store.empezarCapacitacion).not.toHaveBeenCalled();

    store.empezarCapacitacion.mockRejectedValueOnce(new Error('caído'));
    boton(el, 'Empezar capacitación').click();
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('No se pudo empezar la capacitación', 5000, 'error');
  });

  it('en curso: la barra cuenta las pruebas y la lista muestra cada una', async () => {
    store.capacitacion.set(enCurso(2));
    const { fixture, el } = await crear('barra');
    expect(el.textContent).toContain('Capacitación en curso');
    expect(el.textContent).toContain('2 reportes de prueba');
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    const items = el.querySelectorAll('.cap-lista li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Territorio 15');
    expect(items[0].textContent).toContain('Sin nombre');
    expect(items[1].textContent).toContain('Juan Pérez · completo');
    // Volver cierra la lista.
    boton(el, 'Volver').click();
    await fixture.whenStable();
    expect(el.querySelector('.cap-lista')).toBeNull();
  });

  it('terminar pide escribir BORRAR, borra y avisa cuántos', async () => {
    store.capacitacion.set(enCurso(3));
    const { fixture, el } = await crear('tarjeta');
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    boton(el, 'Terminar y borrar las pruebas').click();
    await fixture.whenStable();
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ escribir: 'BORRAR', peligro: true, titulo: 'Borrar los 3 reportes de prueba' }));
    expect(store.terminarCapacitacion).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Capacitación terminada: se borraron 3 reportes de prueba', 5000, 'success');
  });

  it('sin pruebas se termina sin escribir nada; con una sola lo dice en singular', async () => {
    store.capacitacion.set(enCurso(0));
    store.terminarCapacitacion.mockResolvedValueOnce(0);
    const { fixture, el } = await crear('tarjeta');
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Todavía no se ha enviado nada');
    boton(el, 'Terminar capacitación').click();
    await fixture.whenStable();
    expect(confirmar.mock.calls.at(-1)?.[0].escribir).toBeUndefined();
    expect(toast.show).toHaveBeenCalledWith('Capacitación terminada', 5000, 'success');

    store.capacitacion.set(enCurso(1));
    store.terminarCapacitacion.mockResolvedValueOnce(1);
    await fixture.whenStable();
    expect(el.textContent).toContain('1 reporte de prueba');
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    boton(el, 'Terminar y borrar las pruebas').click();
    await fixture.whenStable();
    expect(confirmar.mock.calls.at(-1)?.[0].titulo).toBe('Borrar el reporte de prueba');
    expect(toast.show).toHaveBeenCalledWith('Capacitación terminada: se borró 1 reporte de prueba', 5000, 'success');
  });

  it('si no se confirma no borra; si falla, lo dice', async () => {
    store.capacitacion.set(enCurso(2));
    const { fixture, el } = await crear('tarjeta');
    confirmar.mockResolvedValueOnce(false);
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    boton(el, 'Terminar y borrar las pruebas').click();
    await fixture.whenStable();
    expect(store.terminarCapacitacion).not.toHaveBeenCalled();

    store.terminarCapacitacion.mockRejectedValueOnce(new Error('caído'));
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    boton(el, 'Terminar y borrar las pruebas').click();
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('No se pudo terminar la capacitación', 6000, 'error');
  });

  it('un clic en el fondo cierra la lista', async () => {
    store.capacitacion.set(enCurso(1));
    const { fixture, el } = await crear('barra');
    boton(el, 'Ver y terminar').click();
    await fixture.whenStable();
    const fondo = el.querySelector('.adm-overlay') as HTMLElement;
    (el.querySelector('.cap-lista') as HTMLElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.cap-lista')).not.toBeNull();
    fondo.click();
    await fixture.whenStable();
    expect(el.querySelector('.cap-lista')).toBeNull();
  });

  it('la barra se mantiene al día cada medio minuto (también si se empezó desde otro aparato); la tarjeta no repite', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    store.capacitacion.set({ activa: false, desde: null, pruebas: [] });
    const { fixture, el } = await crear('barra');
    const antes = store.cargarCapacitacion.mock.calls.length;
    store.cargarCapacitacion.mockImplementationOnce(async () => store.capacitacion.set(enCurso(1)));
    vi.advanceTimersByTime(REFRESCO_CAPACITACION_MS);
    expect(store.cargarCapacitacion.mock.calls.length).toBe(antes + 1);
    await fixture.whenStable();
    expect(el.textContent).toContain('1 reporte de prueba');
    fixture.destroy();
    vi.advanceTimersByTime(REFRESCO_CAPACITACION_MS);
    expect(store.cargarCapacitacion.mock.calls.length).toBe(antes + 1);

    await crear('tarjeta');
    const conTarjeta = store.cargarCapacitacion.mock.calls.length;
    vi.advanceTimersByTime(REFRESCO_CAPACITACION_MS);
    expect(store.cargarCapacitacion.mock.calls.length).toBe(conTarjeta);
  });
});
