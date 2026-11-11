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
    features: [manzana('72.a', 0), manzana('72.b', 1), { ...manzana('61.a', 2), properties: { id: 2, territorio: 61, nombre: '61.a' } }],
  } as ManzanasCollection);

  beforeEach(async () => {
    api = {
      whatsappDestino: vi.fn().mockResolvedValue({ telefono: '56912345678' }),
      setWhatsappDestino: vi.fn(),
      estadoTerritorio: vi.fn().mockImplementation(async (t: number) => t === 61 ? null : {
        territorio: 72, fecha: '2026-10-01T12:00:00Z', estado: 'incomplete', origen: 'salida', encargado: 'Ana Pérez',
        manzanasIds: '72-72.a', geometriaParcial: null, puntosParciales: null, totalManzanas: 2,
      }),
      registrarSalidas: vi.fn().mockImplementation(async (pedidos: { territorio: number }[]) =>
        pedidos.map((p, i) => ({
          id: 50 + i, territorioNumero: p.territorio, estado: p.territorio === 72 ? 'completed' : 'incomplete',
          manzanasMarcadas: p.territorio === 72 ? 2 : 1, totalManzanas: p.territorio === 72 ? 2 : 3,
          encargadoNombre: 'Pedro', encargadoApellido: 'Soto', fechaPredicacion: '2026-11-07', turno: 'mañana',
        })),
      ),
    };
    whatsapp = { sendReport: vi.fn().mockResolvedValue({ success: true, messageId: 'x', error: null }) };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    const store = {
      encargados: signal(encargados),
      manzanas,
      colores: signal({ 72: '#ec4899' }),
      territorios: computed(() => [61, 72]),
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
      agregarTerritorio(t: number): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
      puedeGuardar(): boolean;
      registrados(): unknown[];
      territorios(): number[];
    };
    fixture.detectChanges();

    page.hermanoTexto.set('Pedro Soto');
    page.dia.set('2026-11-07');
    await page.agregarTerritorio(72);
    expect(page.puedeGuardar()).toBe(false);

    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    expect(page.puedeGuardar()).toBe(true);
    await page.registrar();

    expect(api['registrarSalidas']).toHaveBeenCalledWith([
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
    ]);
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
    expect(page.territorios()).toEqual([]);
    expect(page.hermanoTexto()).toBe('Pedro Soto');
  });

  it('si el WhatsApp falla, la salida igual queda registrada y se avisa', async () => {
    whatsapp.sendReport.mockRejectedValue(new Error('caído'));
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      agregarTerritorio(t: number): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
    };
    page.hermanoTexto.set('Ana Pérez');
    await page.agregarTerritorio(72);
    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    await page.registrar();

    expect(api['registrarSalidas']).toHaveBeenCalledWith([expect.objectContaining({ encargadoId: 7 })]);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('no se pudo enviar'), 4000, 'warning');
  });

  it('si cancela la confirmación no se registra nada', async () => {
    ui.confirmar.mockResolvedValue(false);
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      agregarTerritorio(t: number): Promise<void>;
      alTocarManzana(m: ManzanaFeature): void;
      registrar(): Promise<void>;
    };
    page.hermanoTexto.set('Ana Pérez');
    await page.agregarTerritorio(72);
    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    await page.registrar();

    expect(api['registrarSalidas']).not.toHaveBeenCalled();
    expect(whatsapp.sendReport).not.toHaveBeenCalled();
  });

  it('una salida con varios territorios va junta y manda un solo WhatsApp con todos', async () => {
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      hermanoTexto: ReturnType<typeof signal<string>>;
      agregarTerritorio(t: number): Promise<void>;
      quitarTerritorio(t: number): void;
      alTocarManzana(m: ManzanaFeature): void;
      todo(t: number): void;
      registrar(): Promise<void>;
      puedeGuardar(): boolean;
      sinMarcar(): number[];
    };
    page.hermanoTexto.set('Pedro Soto');
    await page.agregarTerritorio(72);
    await page.agregarTerritorio(61);
    page.alTocarManzana(manzanas()!.features[1] as ManzanaFeature);
    // El 61 todavía no tiene nada: no se puede guardar.
    expect(page.sinMarcar()).toEqual([61]);
    expect(page.puedeGuardar()).toBe(false);

    page.todo(61);
    expect(page.puedeGuardar()).toBe(true);
    await page.registrar();

    expect(api['registrarSalidas']).toHaveBeenCalledTimes(1);
    const pedidos = api['registrarSalidas'].mock.calls[0][0] as { territorio: number; manzanasIds: string }[];
    expect(pedidos.map(p => [p.territorio, p.manzanasIds])).toEqual([[72, '72-72.b'], [61, '61-61.a']]);
    expect(whatsapp.sendReport).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendReport.mock.calls[0][0].territorios).toEqual([
      { numero: 72, finalizado: true, totalManzanas: 2, manzanasMarcadas: 2 },
      { numero: 61, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 },
    ]);
  });

  it('quitar un territorio borra lo marcado en él', async () => {
    const fixture = TestBed.createComponent(RegistrarPage);
    const page = fixture.componentInstance as unknown as {
      agregarTerritorio(t: number): Promise<void>;
      quitarTerritorio(t: number): void;
      todo(t: number): void;
      edicion(): { marcadas: Set<string> };
      territorios(): number[];
    };
    await page.agregarTerritorio(72);
    await page.agregarTerritorio(61);
    page.todo(61);
    page.quitarTerritorio(61);

    expect(page.territorios()).toEqual([72]);
    expect([...page.edicion().marcadas]).toEqual(['72-72.a']);
  });

  describe('marcar en el mapa y el número del WhatsApp', () => {
    type Pagina = {
      territorios(): number[];
      activo(): number | null;
      estados(): Map<number, unknown>;
      cargandoTerritorio(): number | null;
      modo(): 'entera' | 'calles';
      manzanaCalles(): ManzanaFeature | null;
      calles(): { indice: number; marcada: boolean }[] | null;
      edicion(): { marcadas: Set<string>; zonas: unknown[] };
      destino(): string | null;
      editandoDestino(): boolean;
      destinoTexto: ReturnType<typeof signal<string>>;
      texto(e: Event): string;
      alElegirTerritorio(e: Event): Promise<void>;
      agregarTerritorio(t: number): Promise<void>;
      cambiarModo(m: 'entera' | 'calles'): void;
      alTocarManzana(m: ManzanaFeature): void;
      alTocarCalle(i: number): void;
      alTocarZona(i: number): void;
      deshacer(t: number): void;
      editarDestino(): void;
      guardarDestino(): Promise<void>;
    };
    const crear = () => TestBed.createComponent(RegistrarPage).componentInstance as unknown as Pagina;
    const m72b = () => manzanas()!.features[1] as ManzanaFeature;

    it('elegir un territorio del selector lo agrega y deja el selector vacío; elegirlo de nuevo solo lo activa', async () => {
      const page = crear();
      const select = document.createElement('select');
      select.innerHTML = '<option value=""></option><option value="72">72</option>';
      select.value = '72';
      await page.alElegirTerritorio({ target: select } as unknown as Event);
      expect(select.value).toBe('');
      expect(page.territorios()).toEqual([72]);
      await page.agregarTerritorio(61);
      await page.agregarTerritorio(72);
      expect(page.territorios()).toEqual([72, 61]);
      expect(page.activo()).toBe(72);
      // El selector vacío no hace nada.
      await page.alElegirTerritorio({ target: select } as unknown as Event);
      expect(page.territorios()).toEqual([72, 61]);
      expect(page.texto({ target: { value: 'hola' } } as unknown as Event)).toBe('hola');
    });

    it('si no se puede cargar el territorio, lo quita y lo dice', async () => {
      api['estadoTerritorio'].mockRejectedValueOnce(new Error('caído'));
      const page = crear();
      await page.agregarTerritorio(72);
      expect(page.territorios()).toEqual([]);
      expect(page.cargandoTerritorio()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('territorio 72'), 5000, 'error');
    });

    it('si lo quitan mientras carga, no queda nada de él', async () => {
      let soltar!: (v: unknown) => void;
      api['estadoTerritorio'].mockReturnValueOnce(new Promise(r => (soltar = r)));
      const page = crear();
      const carga = page.agregarTerritorio(72);
      (page as unknown as { quitarTerritorio(t: number): void }).quitarTerritorio(72);
      soltar(null);
      await carga;
      expect(page.estados().has(72)).toBe(false);
    });

    it('por calles: una manzana ya completa no se abre; otra muestra sus calles y se marcan una a una', async () => {
      const page = crear();
      await page.agregarTerritorio(72);
      page.cambiarModo('calles');
      // 72.a ya estaba completa en el estado anterior.
      page.alTocarManzana(manzanas()!.features[0] as ManzanaFeature);
      expect(toast.show).toHaveBeenCalledWith('La manzana 72.a ya estaba completa', 3000, 'info');
      expect(page.manzanaCalles()).toBeNull();

      page.alTocarManzana(m72b());
      expect(page.manzanaCalles()?.properties.nombre).toBe('72.b');
      expect(page.calles()?.length).toBeGreaterThan(0);
      page.alTocarCalle(0);
      expect(page.calles()?.[0].marcada).toBe(true);
      expect(page.edicion().zonas).toHaveLength(1);

      // Tocar la franja marcada en modo calles vuelve a abrir esa manzana.
      page.cambiarModo('entera');
      expect(page.manzanaCalles()).toBeNull();
      page.cambiarModo('calles');
      page.alTocarZona(0);
      expect(page.manzanaCalles()?.properties.nombre).toBe('72.b');
      // En modo entera, tocar la franja la quita.
      page.cambiarModo('entera');
      page.alTocarZona(0);
      expect(page.edicion().zonas).toHaveLength(0);
      // Sin manzana abierta, tocar una calle no hace nada.
      page.alTocarCalle(0);
      expect(page.edicion().zonas).toHaveLength(0);
    });

    it('deshacer deja el territorio como estaba antes de la salida', async () => {
      const page = crear();
      await page.agregarTerritorio(72);
      page.alTocarManzana(m72b());
      expect([...page.edicion().marcadas].sort((a, b) => a.localeCompare(b))).toEqual(['72-72.a', '72-72.b']);
      page.deshacer(72);
      expect([...page.edicion().marcadas]).toEqual(['72-72.a']);
    });

    it('el número del WhatsApp: se edita, se valida y se guarda', async () => {
      api['setWhatsappDestino'].mockResolvedValue({ telefono: '56987654321' });
      const page = crear();
      await vi.waitFor(() => expect(page.destino()).toBe('56912345678'));
      page.editarDestino();
      expect(page.editandoDestino()).toBe(true);
      expect(page.destinoTexto()).toBe('56912345678');

      page.destinoTexto.set('12345');
      await page.guardarDestino();
      expect(api['setWhatsappDestino']).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'warning');

      page.destinoTexto.set('987654321');
      await page.guardarDestino();
      expect(api['setWhatsappDestino']).toHaveBeenCalledWith('987654321');
      expect(page.destino()).toBe('56987654321');
      expect(page.editandoDestino()).toBe(false);

      api['setWhatsappDestino'].mockRejectedValue(new Error('sin permiso'));
      page.editarDestino();
      await page.guardarDestino();
      expect(page.editandoDestino()).toBe(true);
      expect(toast.show).toHaveBeenLastCalledWith(expect.any(String), 5000, 'error');
    });

    it('si no se puede leer el número del WhatsApp, queda vacío', async () => {
      api['whatsappDestino'].mockRejectedValue(new Error('caído'));
      const page = crear();
      await new Promise(r => setTimeout(r, 0));
      expect(page.destino()).toBeNull();
    });
  });
});
