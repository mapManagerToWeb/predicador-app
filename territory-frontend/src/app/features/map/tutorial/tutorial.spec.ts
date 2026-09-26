import { TestBed } from '@angular/core/testing';
import { PASOS, Tutorial } from './tutorial';

describe('Tutorial', () => {
  async function crear() {
    const fixture = TestBed.createComponent(Tutorial);
    const cerrado = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrado);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, cerrado };
  }

  it('recorre los pasos y termina con "Entendido"', async () => {
    const { fixture, el, cerrado } = await crear();
    expect(el.querySelector('h2')?.textContent).toBe(PASOS[0].titulo);
    for (let i = 1; i < PASOS.length; i++) {
      (el.querySelector('.principal') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(el.querySelector('h2')?.textContent).toBe(PASOS[i].titulo);
    }
    expect(el.querySelector('.principal')?.textContent?.trim()).toBe('Entendido');
    (el.querySelector('.principal') as HTMLButtonElement).click();
    expect(cerrado).toHaveBeenCalled();
  });

  it('resalta el elemento del paso si está en pantalla', async () => {
    const objetivo = document.createElement('div');
    objetivo.setAttribute('data-tutorial', 'buscar');
    document.body.appendChild(objetivo);
    try {
      const { fixture, el } = await crear();
      expect(el.querySelector('.foco')).toBeNull();
      (el.querySelector('.principal') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(el.querySelector('.foco')).not.toBeNull();
    } finally {
      objetivo.remove();
    }
  });

  it('"Saltar" lo cierra', async () => {
    const { el, cerrado } = await crear();
    (el.querySelector('.secundario') as HTMLButtonElement).click();
    expect(cerrado).toHaveBeenCalled();
  });
});
