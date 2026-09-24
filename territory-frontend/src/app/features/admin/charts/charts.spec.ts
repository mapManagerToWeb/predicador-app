import { TestBed } from '@angular/core/testing';
import { BarList } from './bar-list';
import { Heatmap } from './heatmap';

describe('gráficos del panel', () => {
  it('BarList ordena por el dato recibido, rotula el valor y limita la cantidad', async () => {
    const fixture = TestBed.createComponent(BarList);
    fixture.componentRef.setInput('barras', [
      { etiqueta: 'Ana', valor: 10, detalle: '3 reportes' },
      { etiqueta: 'Luis', valor: 5 },
      { etiqueta: 'Eva', valor: 1 },
    ]);
    fixture.componentRef.setInput('limite', 2);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const filas = el.querySelectorAll('li');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Ana');
    expect(filas[0].textContent).toContain('10');
    expect((filas[1].querySelector('.viz-barlist-bar') as HTMLElement).style.width).toBe('50%');
    expect(el.textContent).toContain('Se muestran 2 de 3');
  });

  it('BarList sin datos muestra el estado vacío', async () => {
    const fixture = TestBed.createComponent(BarList);
    fixture.componentRef.setInput('barras', []);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin datos');
  });

  it('Heatmap pinta 7 × 24 celdas y muestra el detalle al enfocar una', async () => {
    const matriz = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    matriz[0][18] = 4;
    const fixture = TestBed.createComponent(Heatmap);
    fixture.componentRef.setInput('matriz', matriz);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const celdas = el.querySelectorAll('.viz-heat [role=gridcell]');
    expect(celdas).toHaveLength(168);
    const lunes18 = celdas[18] as HTMLElement;
    expect(lunes18.classList.contains('cero')).toBe(false);
    expect(lunes18.getAttribute('aria-label')).toBe('Lunes 18:00: 4 reportes');

    lunes18.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    expect(el.querySelector('.viz-heat-readout')?.textContent).toContain('4 reportes');
  });
});
