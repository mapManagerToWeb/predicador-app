import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MapaStore } from '../mapa.store';
import { PASOS, Tutorial } from './tutorial';

/** Lo que el tutorial usa del store, con la salida de práctica en señales. */
@Injectable()
class StoreFalso {
  readonly salida = signal(new Map<number, { marcadas: string[]; zonas: { manzanaId: string | null }[] }>());
  readonly modo = signal<'manzana' | 'calles'>('manzana');
  readonly edicion = signal<{ manzanaId: string; seleccion: number[] } | null>(null);
  readonly practica = signal(false);
  iniciarPractica = vi.fn((t: number) => {
    this.practica.set(true);
    this.salida.set(new Map([[t, { marcadas: [], zonas: [] }]]));
  });
  terminarPractica = vi.fn(() => this.practica.set(false));
  sugerirPractica = vi.fn(() => ({ territorio: 5, manzana: '5-5.a' }));
  resaltarManzana = vi.fn();
  encuadrarManzana = vi.fn();
  ajustarMargenes = vi.fn();
  guardarLados = vi.fn(() => this.edicion.set(null));
  tocar = vi.fn((t: { manzana: string }) => {
    const marcadas = this.salida().get(5)?.marcadas ?? [];
    this.marcar(marcadas.includes(t.manzana) ? [] : [t.manzana]);
  });
  cambiarModo = vi.fn((m: 'manzana' | 'calles') => this.modo.set(m));
  tocarLado = vi.fn();

  marcar(marcadas: string[], zonas: string[] = []): void {
    this.salida.set(new Map([[5, { marcadas, zonas: zonas.map(manzanaId => ({ manzanaId })) }]]));
  }
}

describe('Tutorial con práctica', () => {
  let store: StoreFalso;

  async function crear() {
    TestBed.configureTestingModule({ providers: [{ provide: MapaStore, useClass: StoreFalso }] });
    const fixture = TestBed.createComponent(Tutorial);
    store = TestBed.inject(MapaStore) as unknown as StoreFalso;
    const cerrado = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrado);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const titulo = () => el.querySelector('h2')?.textContent?.trim();
    const avanzar = async () => {
      (el.querySelector('.principal') as HTMLButtonElement).click();
      await fixture.whenStable();
    };
    /** Espera a que el paso cambie (tras la felicitación). */
    const esperar = async (t: string) => {
      await vi.waitFor(() => expect(titulo()).toBe(t), { timeout: 3000 });
      await fixture.whenStable();
    };
    return { fixture, el, cerrado, titulo, avanzar, esperar };
  }

  it('solo avanza cuando el usuario hace cada paso en el mapa', async () => {
    const { el, titulo, avanzar, esperar, fixture, cerrado } = await crear();
    expect(titulo()).toBe(PASOS[0].titulo);
    await avanzar(); // Empezar
    await avanzar(); // Abre tu territorio → empieza la práctica
    expect(store.iniciarPractica).toHaveBeenCalledWith(5);
    expect(titulo()).toBe('Marca una manzana');
    expect(store.resaltarManzana).toHaveBeenLastCalledWith('5-5.a');
    // Un paso para hacer no tiene "Siguiente": hay que hacerlo.
    expect(el.querySelector('.principal')).toBeNull();

    store.marcar(['5-5.a']);
    await fixture.whenStable();
    expect(titulo()).toContain('¡Muy bien!');
    await esperar('¿Te equivocaste?');

    store.marcar([]);
    await esperar('¿Solo algunas calles?');
    store.modo.set('calles');
    await esperar('Abre la manzana');
    store.edicion.set({ manzanaId: '5-5.a', seleccion: [] });
    await esperar('Elige las calles');
    store.edicion.set({ manzanaId: '5-5.a', seleccion: [1] });
    await esperar('Guárdala');
    store.edicion.set(null);
    store.marcar([], ['5-5.a']);
    await esperar('Envía el reporte');

    await avanzar();
    await avanzar();
    expect(titulo()).toBe(PASOS.at(-1)!.titulo);
    await avanzar();
    expect(cerrado).toHaveBeenCalled();
  }, 30_000);

  it('si alguien no puede hacer un paso, a los 20 s aparece "Hazlo por mí" y la app lo hace delante suyo', async () => {
    const { el, titulo, avanzar, fixture, esperar } = await crear();
    await avanzar();
    await avanzar();
    expect(titulo()).toBe('Marca una manzana');
    expect(el.querySelector('.principal')).toBeNull();
    // Pasaron los 20 segundos sin que lo hiciera.
    (fixture.componentInstance as unknown as { ayuda: { set(v: boolean): void } }).ayuda.set(true);
    await fixture.whenStable();
    const ayuda = el.querySelector('.principal') as HTMLButtonElement;
    expect(ayuda.textContent).toContain('Hazlo por mí');
    ayuda.click();
    await fixture.whenStable();
    expect(store.tocar).toHaveBeenCalledWith({ manzana: '5-5.a', cercana: null });
    expect(titulo()).toContain('¡Muy bien!');
    // El siguiente paso (desmarcar) no se da por hecho solo: la manzana quedó marcada.
    await esperar('¿Te equivocaste?');
    await new Promise(r => setTimeout(r, 600));
    expect(titulo()).toBe('¿Te equivocaste?');
  }, 15_000);

  it('al cerrar (o salir a mitad de camino) termina la práctica y devuelve el mapa como estaba', async () => {
    const { el, avanzar, fixture } = await crear();
    await avanzar();
    await avanzar();
    (el.querySelector('.salir') as HTMLButtonElement).click();
    fixture.destroy();
    expect(store.terminarPractica).toHaveBeenCalled();
    expect(store.resaltarManzana).toHaveBeenLastCalledWith(null);
    expect(store.ajustarMargenes).toHaveBeenLastCalledWith({ arriba: 90 });
  });

  it('los pasos para hacer no se pueden "volver" a hacer con Anterior', async () => {
    const { titulo, avanzar, esperar, fixture, el } = await crear();
    await avanzar();
    await avanzar();
    store.marcar(['5-5.a']);
    await fixture.whenStable();
    await esperar('¿Te equivocaste?');
    store.marcar([]);
    await esperar('¿Solo algunas calles?');
    store.modo.set('calles');
    await esperar('Abre la manzana');
    store.edicion.set({ manzanaId: '5-5.a', seleccion: [1] });
    await esperar('Guárdala');
    store.edicion.set(null);
    store.marcar([], ['5-5.a']);
    await esperar('Envía el reporte');
    const anterior = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Anterior')) as HTMLButtonElement;
    anterior.click();
    await fixture.whenStable();
    expect(titulo()).toBe('Abre tu territorio');
  }, 30_000);
});
