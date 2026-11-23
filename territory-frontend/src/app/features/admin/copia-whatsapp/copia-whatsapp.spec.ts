import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../core/services/toast';
import { AdminApi } from '../services/admin-api';
import { CopiaWhatsappPanel } from './copia-whatsapp';

describe('CopiaWhatsappPanel: copia de cada reporte por WhatsApp', () => {
  let api: { whatsappCopia: ReturnType<typeof vi.fn>; setWhatsappCopia: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      whatsappCopia: vi.fn().mockResolvedValue({ telefono: '' }),
      setWhatsappCopia: vi.fn(async (t: string) => ({ telefono: t ? '56987654321' : '' })),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CopiaWhatsappPanel],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: Toast, useValue: toast },
      ],
    });
  });

  async function crear() {
    const fixture = TestBed.createComponent(CopiaWhatsappPanel);
    await fixture.whenStable();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const boton = (texto: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
    const escribir = async (valor: string) => {
      const input = el.querySelector('input') as HTMLInputElement;
      input.value = valor;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, boton, escribir };
  }

  it('sin número dice que no hay copia; se elige uno y se guarda', async () => {
    const { fixture, el, boton, escribir } = await crear();
    expect(el.textContent).toContain('Sin copia');
    boton('Elegir un número').click();
    await fixture.whenStable();
    await escribir('9 8765 4321');
    boton('Guardar').click();
    await fixture.whenStable();
    expect(api.setWhatsappCopia).toHaveBeenCalledWith('9 8765 4321');
    expect(el.textContent).toContain('+56 9 8765 4321');
    expect(toast.show).toHaveBeenCalledWith('Listo: las copias llegarán a ese número', 3500, 'success');
  });

  it('un número inválido no se manda; cancelar vuelve sin cambios', async () => {
    const { fixture, el, boton, escribir } = await crear();
    boton('Elegir un número').click();
    await fixture.whenStable();
    await escribir('123');
    boton('Guardar').click();
    await fixture.whenStable();
    expect(api.setWhatsappCopia).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('9 dígitos'), 5000, 'warning');
    boton('Cancelar').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Sin copia');
  });

  it('con número guardado se puede cambiar o vaciar (sin copias); si falla, lo dice', async () => {
    api.whatsappCopia.mockResolvedValue({ telefono: '56987654321' });
    const { fixture, el, boton, escribir } = await crear();
    expect(el.textContent).toContain('+56 9 8765 4321');
    boton('Cambiar').click();
    await fixture.whenStable();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('+56 9 8765 4321');
    await escribir('');
    boton('Guardar').click();
    await fixture.whenStable();
    expect(api.setWhatsappCopia).toHaveBeenCalledWith('');
    expect(toast.show).toHaveBeenCalledWith('Listo: ya no se envían copias', 3500, 'success');

    api.setWhatsappCopia.mockRejectedValueOnce(new Error('caído'));
    boton('Elegir un número').click();
    await fixture.whenStable();
    await escribir('912345678');
    boton('Guardar').click();
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('No se pudo guardar el número', 5000, 'error');
  });

  it('con un servidor que no tiene la opción, lo avisa', async () => {
    api.whatsappCopia.mockRejectedValue(new Error('404'));
    const { el } = await crear();
    expect(el.textContent).toContain('cuando el servidor esté actualizado');
  });
});
