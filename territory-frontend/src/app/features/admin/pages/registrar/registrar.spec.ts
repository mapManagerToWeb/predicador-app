import { computed, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WhatsAppService } from '../../../../core/services/whatsapp';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, ManzanasCollection } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { fechaParaWhatsApp, RegistrarPage, resolverHermano } from './registrar';

const encargados = [
  { id: 7, nombre: 'Ana', apellido: 'Pérez', activo: true },
  { id: 8, nombre: 'Luis', apellido: 'Rojas', activo: false },
];

function manzana(nombre: string, x: number): ManzanaFeature {
  return {
    type: 'Feature',
    id: x,
    properties: { id: x, territorio: 72, nombre } as ManzanaFeature['properties'],
    geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 0.001, 0], [x + 0.001, 0.001], [x, 0.001], [x, 0]]] },
  } as ManzanaFeature;
}

describe('ayudas del registro', () => {
  it('reconoce a un encargado aunque se escriba sin tildes ni mayúsculas', () => {
    expect(resolverHermano('ana  perez', encargados)).toEqual({ id: 7, nombre: 'Ana', apellido: 'Pérez' });
    expect(resolverHermano('Pedro Soto', encargados)).toEqual({ id: null, nombre: 'Pedro', apellido: 'Soto' });
  });

  it('la fecha del WhatsApp va como día-mes-año', () => {
    expect(fechaParaWhatsApp('2026-11-07')).toBe('07-11-2026');
  });
});

describe('RegistrarPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let whatsapp: { sendReport: ReturnType<typeof vi.fn> };
  let ui: { confirmar: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  const manzanas = signal<ManzanasCollection | null>({
    type: 'FeatureCollection',
    features: [manzana('72.a', 0), manzana('72.b', 1)],
  } as ManzanasCollection);

  beforeEach(async () => {
    api = {
      whatsappDestino: vi.fn().mockResolvedValue({ telefono: '56912345678' }),
      setWhatsappDestino: vi.fn(),
      estadoTerritorio: vi.fn().mockResolvedValue({
        territorio: 72, fecha: '2026-10-01T12:00:00Z', estado: 'incomplete', origen: 'salida', encargado: 'Ana Pérez',
        manzanasIds: '72-72.a', geometriaParcial: null, puntosParciales: null, totalManzanas: 2,
      }),
      registrarSalida: vi.fn().mockResolvedValue({
        id: 50, territorioNumero: 72, estado: 'completed', manzanasMarcadas: 2, totalManzanas: 2,
        encargadoNombre: 'Pedro', encargadoApellido: 'Soto', fechaPredicacion: '2026-11-07', turno: 'mañana',
      }),
    };
    whatsapp = { sendReport: vi.fn().mockResolvedValue({ success: true, messageId: 'x', error: null }) };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    const store = {
      encargados: signal(encargados),
      manzanas,
      colores: signal({ 72: '#ec4899' }),
      territorios: computed(() => [72]),
      cargarEncargados: vi.fn().mockResolvedValue(undefined),
      cargarManzanas: vi.fn().mockResolvedValue(undefined),
      cargarReportes: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [RegistrarPage],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: AdminUi, useValue: ui },
        { provide: Toast, useValue: toast },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    })
      // El mapa (MapLibre) no corre en las pruebas.
      .overrideComponent(RegistrarPage, { set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  it('registra lo nuevo a nombre del hermano y manda el resumen por WhatsApp', async () => {
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      dia: ReturnType<typeof signal<string>>;
      elegirTerritorio(e: Event): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
      puedeGuardar(): boolean;
      registrados(): unknown[];
      territorio(): number | null;
    };
    fixture.detectChanges();

    page.hermanoTexto.set('Pedro Soto');
    page.dia.set('2026-11-07');
    await page.elegirTerritorio({ target: { value: '72' } } as unknown as Event);
    expect(page.puedeGuardar()).toBe(false);

    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    expect(page.puedeGuardar()).toBe(true);
    await page.registrar();

    expect(api['registrarSalida']).toHaveBeenCalledWith(
      expect.objectContaining({
        territorio: 72,
        encargadoId: null,
        encargadoNombre: 'Pedro',
        encargadoApellido: 'Soto',
        fechaPredicacion: '2026-11-07',
        turno: 'mañana',
        manzanasIds: '72-72.b',
        totalManzanas: 2,
      }),
    );
    expect(whatsapp.sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        encargadoNombre: 'Pedro',
        fechaRegistro: '07-11-2026',
        predicacion: 'mañana',
        territorios: [{ numero: 72, finalizado: true, totalManzanas: 2, manzanasMarcadas: 2 }],
        screenshotBase64: null,
      }),
    );
    expect(page.registrados()).toHaveLength(1);
    // Listo para el siguiente: se limpia el territorio, se mantienen hermano y día.
    expect(page.territorio()).toBeNull();
    expect(page.hermanoTexto()).toBe('Pedro Soto');
  });

  it('si el WhatsApp falla, la salida igual queda registrada y se avisa', async () => {
    whatsapp.sendReport.mockRejectedValue(new Error('caído'));
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      elegirTerritorio(e: Event): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
    };
    page.hermanoTexto.set('Ana Pérez');
    await page.elegirTerritorio({ target: { value: '72' } } as unknown as Event);
    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    await page.registrar();

    expect(api['registrarSalida']).toHaveBeenCalledWith(expect.objectContaining({ encargadoId: 7 }));
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('no se pudo enviar'), 4000, 'warning');
  });

  it('si cancela la confirmación no se registra nada', async () => {
    ui.confirmar.mockResolvedValue(false);
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      elegirTerritorio(e: Event): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
    };
    page.hermanoTexto.set('Ana Pérez');
    await page.elegirTerritorio({ target: { value: '72' } } as unknown as Event);
    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    await page.registrar();

    expect(api['registrarSalida']).not.toHaveBeenCalled();
    expect(whatsapp.sendReport).not.toHaveBeenCalled();
  });
});
