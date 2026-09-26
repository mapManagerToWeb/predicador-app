import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Polygon } from 'geojson';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { DraftMarksService } from '../../core/services/map-draft';
import type { Reporte } from '../../core/models/models';
import { WhatsAppService } from './services/whatsapp';
import { MapaStore, type VistaMapa } from './mapa.store';

const cuadrado = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]],
});

const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    ...['a', 'b', 'c'].map((l, i) => ({
      type: 'Feature',
      geometry: cuadrado(-73.34 + i * 0.002, -37.5),
      properties: { id: `5-5.${l}`, mid: 100 + i, nombre_bloque: `5.${l}`, territorio_padre: 5, color: null },
    })),
    { type: 'Feature', geometry: cuadrado(-73.33, -37.5), properties: { id: '6-6.a', mid: 200, nombre_bloque: '6.a', territorio_padre: 6, color: null } },
  ],
});

function reporte(p: Partial<Reporte>): Reporte {
  return {
    id: 1, manzanaId: null, fecha: '2026-09-20T12:00:00Z', encargadoId: 1, encargadoNombre: 'Ana', encargadoApellido: 'P',
    sessionTime: '2026-09-20T12:00:00Z', estado: 'incomplete', territorioNumero: 5, totalManzanas: 3, manzanasMarcadas: 1,
    tipoSesion: 'parcial', geometriaParcial: null, puntosParciales: null, manzanasIds: '5-5.a', ...p,
  };
}

describe('MapaStore', () => {
  let store: MapaStore;
  let http: HttpTestingController;
  let territorios: {
    getAllGeoJson: ReturnType<typeof vi.fn>;
    getColores: ReturnType<typeof vi.fn>;
    getReportesPorTerritorio: ReturnType<typeof vi.fn>;
    crearReportes: ReturnType<typeof vi.fn>;
    eliminarReportes: ReturnType<typeof vi.fn>;
  };
  let whatsapp: { sendReport: ReturnType<typeof vi.fn> };
  let vista: { [K in keyof VistaMapa]: ReturnType<typeof vi.fn> };

  function crear(): MapaStore {
    const s = TestBed.inject(MapaStore);
    s.conectar(vista as unknown as VistaMapa);
    return s;
  }

  async function cargar(s: MapaStore): Promise<void> {
    const listo = s.cargar();
    await Promise.resolve();
    http.expectOne(r => r.url.endsWith('/reports/public/estado')).flush([]);
    expect(await listo).toBe(true);
  }

  beforeEach(() => {
    localStorage.clear();
    territorios = {
      getAllGeoJson: vi.fn().mockResolvedValue(GEOJSON),
      getColores: vi.fn().mockResolvedValue({ 5: '#ff0000', 6: '#00ff00' }),
      getReportesPorTerritorio: vi.fn().mockImplementation(async (n: number) => (n === 5 ? [reporte({})] : [])),
      crearReportes: vi.fn().mockImplementation(async regs => regs.map((r: object, i: number) => ({ ...r, id: 500 + i }))),
      eliminarReportes: vi.fn().mockResolvedValue(undefined),
    };
    whatsapp = { sendReport: vi.fn().mockResolvedValue({ success: true, messageId: 'm', error: null }) };
    vista = { mostrar: vi.fn(), encuadrar: vi.fn(), mostrarLados: vi.fn(), capturar: vi.fn().mockResolvedValue('IMG') };
    TestBed.configureTestingModule({
      providers: [
        MapaStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TerritorioService, useValue: territorios },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: Profile, useValue: { currentUser: () => ({ name: 'Ana', lastName: 'P', avatar: 0, encargadoId: 3 }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = crear();
  });

  afterEach(() => localStorage.clear());

  it('el primer toque abre el territorio con lo del último reporte', async () => {
    await cargar(store);
    store.tocar({ manzana: '5-5.b', cercana: null });
    await vi.waitFor(() => expect(store.resumenes()).toHaveLength(1));
    expect(store.abiertos()).toEqual([5]);
    expect(store.resumenes()[0]).toMatchObject({ numero: 5, enteras: 1, total: 3, cambios: false });
    expect(vista.encuadrar).toHaveBeenCalledWith([5]);
  });

  it('en un territorio abierto un toque marca y otro toque desmarca', async () => {
    await cargar(store);
    await store.abrir(5);
    store.tocar({ manzana: '5-5.b', cercana: null });
    expect(store.resumenes()[0]).toMatchObject({ enteras: 2, cambios: true });
    store.tocar({ manzana: '5-5.b', cercana: null });
    expect(store.resumenes()[0]).toMatchObject({ enteras: 1, cambios: false });
    expect(store.estadoVista().marcadas.has('5-5.a')).toBe(true);
  });

  it('tocar otro territorio pregunta antes de agregarlo', async () => {
    await cargar(store);
    await store.abrir(5);
    store.tocar({ manzana: '6-6.a', cercana: null });
    expect(store.pregunta()?.titulo).toContain('territorio 6');
    expect(store.abiertos()).toEqual([5]);
    store.responder(true);
    await vi.waitFor(() => expect(store.abiertos()).toEqual([5, 6]));
  });

  it('cerrar un territorio con marcas sin enviar pregunta; sin cambios cierra directo', async () => {
    await cargar(store);
    await store.abrir(5);
    store.cerrar(5);
    expect(store.abiertos()).toEqual([]);

    await store.abrir(5);
    store.tocar({ manzana: '5-5.c', cercana: null });
    store.cerrar(5);
    expect(store.pregunta()?.peligro).toBe(true);
    store.responder(false);
    expect(store.abiertos()).toEqual([5]);
    store.cerrar(5);
    store.responder(true);
    expect(store.abiertos()).toEqual([]);
  });

  it('por calles: tocar cerca abre la manzana, se eligen calles y "Listo" guarda la franja', async () => {
    await cargar(store);
    await store.abrir(5);
    store.cambiarModo('calles');
    store.tocar({ manzana: null, cercana: '5-5.c' });
    expect(store.edicion()?.manzanaId).toBe('5-5.c');
    expect(vista.mostrarLados).toHaveBeenLastCalledWith(expect.objectContaining({ manzanaId: '5-5.c' }), true);
    store.tocarLado(0);
    store.guardarLados();
    expect(store.edicion()).toBeNull();
    expect(store.resumenes()[0]).toMatchObject({ porCalles: 1, cambios: true });
  });

  it('enviar: pide confirmar, guarda, avisa por WhatsApp con la captura y cierra el territorio', async () => {
    await cargar(store);
    await store.abrir(5);
    store.tocar({ manzana: '5-5.b', cercana: null });
    store.pedirEnvio();
    expect(store.pregunta()?.detalle).toEqual(['Territorio 5: 2 de 3 manzanas']);
    store.responder(true);
    await vi.waitFor(() => expect(store.abiertos()).toEqual([]));
    expect(territorios.crearReportes).toHaveBeenCalledWith([
      expect.objectContaining({ territorioNumero: 5, manzanasIds: '5-5.a,5-5.b', estado: 'incomplete', encargadoId: 3 }),
    ]);
    expect(whatsapp.sendReport).toHaveBeenCalledWith(expect.objectContaining({ screenshotBase64: 'IMG', territorios: [expect.objectContaining({ numero: 5 })] }));
    expect(store.estados().get(5)?.manzanasIds).toBe('5-5.a,5-5.b');
  });

  it('si el WhatsApp falla, borra lo guardado y conserva las marcas', async () => {
    whatsapp.sendReport.mockResolvedValue({ success: false, messageId: null, error: 'x' });
    await cargar(store);
    await store.abrir(5);
    store.tocar({ manzana: '5-5.b', cercana: null });
    store.pedirEnvio();
    store.responder(true);
    await vi.waitFor(() => expect(territorios.eliminarReportes).toHaveBeenCalledWith([500]));
    await vi.waitFor(() => expect(store.enviando()).toBe(false));
    expect(store.resumenes()[0]).toMatchObject({ enteras: 2, cambios: true });
  });

  it('sin cambios no hay nada que enviar', async () => {
    const toast = TestBed.inject(Toast);
    const aviso = vi.spyOn(toast, 'show');
    await cargar(store);
    await store.abrir(5);
    store.pedirEnvio();
    expect(store.pregunta()).toBeNull();
    expect(aviso).toHaveBeenCalledWith('No hay cambios para enviar', 2500);
  });

  it('lo marcado queda en el borrador y vuelve al recargar', async () => {
    vi.useFakeTimers();
    try {
      await cargar(store);
      await store.abrir(5);
      store.tocar({ manzana: '5-5.c', cercana: null });
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(400);
      expect(TestBed.inject(DraftMarksService).cargar()).toMatchObject({ v: 2, abiertos: [5] });
    } finally {
      vi.useRealTimers();
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MapaStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TerritorioService, useValue: territorios },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const otro = crear();
    await cargar(otro);
    expect(otro.abiertos()).toEqual([5]);
    expect(otro.resumenes()[0]).toMatchObject({ enteras: 2, cambios: true });
  });

  it('buscar abre varios territorios y avisa si uno no existe', async () => {
    const aviso = vi.spyOn(TestBed.inject(Toast), 'show');
    await cargar(store);
    await store.buscar('5, 6, 99');
    expect(store.abiertos()).toEqual([5, 6]);
    expect(aviso).toHaveBeenCalledWith('No existe el territorio 99', 3000, 'warning');
  });
});
