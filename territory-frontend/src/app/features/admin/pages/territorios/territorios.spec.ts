import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Toast } from '../../../../core/services/toast';
import type {
  CalidadDatos,
  EstadoTerritorioAdmin,
  ManzanaFeature,
  ManzanaGuardada,
  ManzanasCollection,
} from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { TerritoriosPage, normalizarBusqueda } from './territorios';

const editor = {
  setDatos: vi.fn(),
  setColores: vi.fn(),
  setSeleccion: vi.fn(),
  enfocar: vi.fn(),
  enfocarManzana: vi.fn(),
  setFondo: vi.fn(),
  dibujarNuevo: vi.fn(),
  editarVertices: vi.fn().mockReturnValue(true),
  ocultar: vi.fn(),
  geometriaDibujada: vi.fn().mockReturnValue(null),
  hayDibujo: vi.fn().mockReturnValue(false),
  cancelarDibujo: vi.fn(),
  destruir: vi.fn(),
};

vi.mock('../../map/editor-map', () => ({ EditorMapa: { crear: vi.fn() } }));

type Senal<T> = ReturnType<typeof signal<T>>;

interface VistaTerritorios {
  store: AdminStore;
  paleta: Record<number, string>;
  cargando: Senal<boolean>;
  errorMapa: Senal<string | null>;
  guardando: Senal<boolean>;
  modo: Senal<string>;
  dibujoListo: Senal<boolean>;
  fondo: Senal<string>;
  busqueda: Senal<string>;
  territorio: Senal<number | null>;
  seleccion: Senal<Set<number>>;
  calidad: Senal<CalidadDatos | null>;
  formTerritorio: Senal<number | null>;
  formNombre: Senal<string>;
  destinoMover: Senal<number | null>;
  listaTerritorios(): { numero: number; manzanas: number; color: string }[];
  manzanasEncontradas(): ManzanaFeature[];
  manzanasDelTerritorio(): ManzanaFeature[];
  manzana(): ManzanaFeature | null;
  problemas(): number;
  elegirTerritorio(t: number | null): void;
  irAlPrimero(): void;
  seleccionarManzana(f: ManzanaFeature, enfocar?: boolean): void;
  alternarEnSeleccion(id: number, event: Event): void;
  deseleccionar(): void;
  limpiarSeleccion(): void;
  escape(): void;
  nuevaManzana(): void;
  editarVertices(): void;
  redibujar(): void;
  cancelarDibujo(): void;
  guardar(): Promise<void>;
  reparar(): Promise<void>;
  eliminarManzana(): Promise<void>;
  eliminarSeleccion(): Promise<void>;
  moverSeleccion(): Promise<void>;
  eliminarTerritorio(): Promise<void>;
  cambiarColor(color: string): Promise<void>;
  elegirArchivo(): void;
  importar(event: Event): Promise<void>;
  exportar(): void;
  revisarCalidad(): Promise<void>;
  irAManzana(id: number): void;
  setFondo(f: string): void;
  color(t: number): string;
  nombreDe(id: number): string;
  numero(event: Event): number | null;
  texto(event: Event): string;
  onTerritorioForm(event: Event): void;
  fmtArea(m2: number): string;
}

const POLIGONO = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0], [0, 0]]],
};

function manzana(id: number, territorio: number, nombre: string): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    geometry: POLIGONO,
    properties: { id, territorio, nombre, areaM2: 1200, valida: true } as ManzanaFeature['properties'],
  } as ManzanaFeature;
}

function guardada(id: number, territorio: number, nombre: string, extra: Partial<ManzanaGuardada> = {}): ManzanaGuardada {
  return {
    id,
    territorio,
    nombre,
    areaM2: 1200,
    valida: true,
    solapaCon: [],
    geometria: JSON.stringify(POLIGONO),
    ...extra,
  };
}

const COLECCION: ManzanasCollection = {
  type: 'FeatureCollection',
  features: [manzana(1, 5, '5.a'), manzana(2, 5, '5.b'), manzana(3, 6, '6.a')],
} as ManzanasCollection;

function estado(territorio: number, extra: Partial<EstadoTerritorioAdmin> = {}): EstadoTerritorioAdmin {
  return {
    territorio,
    fecha: '2026-11-01T10:00:00Z',
    estado: 'incomplete',
    origen: 'salida',
    encargado: 'Ana',
    manzanasIds: null,
    geometriaParcial: null,
    puntosParciales: null,
    totalManzanas: 2,
    ...extra,
  };
}

describe('TerritoriosPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ui: { confirmar: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let consulta: Record<string, string>;

  async function montar(): Promise<{ page: VistaTerritorios; fixture: ReturnType<typeof TestBed.createComponent<TerritoriosPage>> }> {
    const fixture = TestBed.createComponent(TerritoriosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
    return { page: fixture.componentInstance as unknown as VistaTerritorios, fixture };
  }

  beforeEach(async () => {
    consulta = {};
    api = {
      manzanas: vi.fn().mockResolvedValue(COLECCION),
      colores: vi.fn().mockResolvedValue({ 5: '#ec4899' }),
      crearManzana: vi.fn(),
      actualizarManzana: vi.fn(),
      repararManzana: vi.fn(),
      eliminarManzana: vi.fn(),
      eliminarManzanas: vi.fn(),
      eliminarTerritorio: vi.fn(),
      reasignarManzanas: vi.fn(),
      asignarColor: vi.fn(),
      importarManzanas: vi.fn(),
      calidad: vi.fn().mockResolvedValue({ invalidas: [], solapes: [] }),
      estadoTerritorio: vi.fn().mockResolvedValue(null),
      corregir: vi.fn(),
      reportesEntre: vi.fn().mockResolvedValue([]),
    };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    const { EditorMapa } = await import('../../map/editor-map');
    (EditorMapa.crear as unknown as { mockClear: () => void }).mockClear();
    (EditorMapa.crear as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(editor);
    Object.values(editor).forEach(fn => {
      if (typeof fn === 'function' && 'mockClear' in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
    });
    editor.editarVertices.mockReturnValue(true);
    editor.geometriaDibujada.mockReturnValue(null);

    await TestBed.configureTestingModule({
      imports: [TerritoriosPage],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminUi, useValue: ui },
        { provide: Toast, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(consulta) } },
        },
      ],
    })
      .overrideComponent(TerritoriosPage, {
        set: { template: '<div #mapa></div><input #archivo type="file" />', styleUrl: undefined },
      })
      .compileComponents();
  });

  it('crea el editor, carga las manzanas y encuadra todo', async () => {
    const { page } = await montar();
    expect(api['manzanas']).toHaveBeenCalled();
    expect(editor.setDatos).toHaveBeenCalledWith(COLECCION, { 5: '#ec4899' });
    expect(editor.enfocar).toHaveBeenCalledWith(COLECCION);
    expect(page.cargando()).toBe(false);
    expect(page.errorMapa()).toBeNull();
  });

  it('abre el territorio pedido por la URL si existe', async () => {
    consulta['t'] = '6';
    const { page } = await montar();
    expect(page.territorio()).toBe(6);
    expect(editor.enfocar).toHaveBeenCalledWith(COLECCION, 6);
  });

  it('ignora el territorio pedido si no existe y guarda el error del editor', async () => {
    consulta['t'] = '99';
    const { page } = await montar();
    expect(page.territorio()).toBeNull();
    expect(editor.enfocar).toHaveBeenCalledWith(COLECCION);
  });

  it('avisa cuando no se puede cargar el editor', async () => {
    const { EditorMapa } = await import('../../map/editor-map');
    (EditorMapa.crear as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(new Error('sin WebGL'));
    const { page } = await montar();
    expect(page.errorMapa()).toBe('No se pudo cargar el editor');
    expect(page.cargando()).toBe(false);
  });

  it('lista los territorios con su conteo y color', async () => {
    const { page } = await montar();
    expect(page.listaTerritorios()).toEqual([
      { numero: 5, manzanas: 2, color: '#ec4899' },
      { numero: 6, manzanas: 1, color: '#888888' },
    ]);
    expect(page.paleta).toBeTruthy();
  });

  it('filtra territorios por número exacto y por prefijo', async () => {
    const { page } = await montar();
    page.busqueda.set('5');
    expect(page.listaTerritorios().map(t => t.numero)).toEqual([5]);
    page.busqueda.set('6');
    expect(page.listaTerritorios().map(t => t.numero)).toEqual([6]);
    page.busqueda.set('sin coincidencia');
    expect(page.listaTerritorios()).toEqual([]);
  });

  it('busca manzanas por nombre y las ordena', async () => {
    const { page } = await montar();
    page.busqueda.set('5.b');
    expect(page.manzanasEncontradas().map(m => m.properties.nombre)).toEqual(['5.b']);
    page.busqueda.set('5');
    expect(page.manzanasEncontradas()).toEqual([]);
    page.busqueda.set('5.');
    expect(page.manzanasEncontradas().map(m => m.properties.nombre)).toEqual(['5.a', '5.b']);
  });

  it('lista las manzanas del territorio elegido y la ficha abierta', async () => {
    const { page } = await montar();
    expect(page.manzanasDelTerritorio()).toEqual([]);
    page.elegirTerritorio(5);
    expect(page.manzanasDelTerritorio().map(m => m.properties.nombre)).toEqual(['5.a', '5.b']);
    expect(page.manzana()).toBeNull();
    page.seleccionarManzana(page.manzanasDelTerritorio()[0]);
    expect(page.manzana()?.properties.nombre).toBe('5.a');
  });

  it('cuenta los problemas de calidad y los limpia si falla la consulta', async () => {
    api['calidad'].mockResolvedValue({ invalidas: [1, 2], solapes: [{ a: 1, b: 2, areaM2: 3 }] });
    const { page } = await montar();
    expect(page.problemas()).toBe(3);

    api['calidad'].mockRejectedValueOnce(new Error('caído'));
    await page.revisarCalidad();
    expect(page.calidad()).toBeNull();
    expect(page.problemas()).toBe(0);
  });

  it('enfoca el territorio elegido y el mapa completo', async () => {
    const { page } = await montar();
    page.elegirTerritorio(5);
    expect(editor.enfocar).toHaveBeenLastCalledWith(COLECCION, 5);
    page.elegirTerritorio(null);
    expect(editor.enfocar).toHaveBeenLastCalledWith(COLECCION);
  });

  it('va a la primera manzana encontrada o al primer territorio', async () => {
    const { page } = await montar();
    page.busqueda.set('6.a');
    page.irAlPrimero();
    expect(page.manzana()?.properties.nombre).toBe('6.a');

    page.busqueda.set('5');
    page.deseleccionar();
    page.irAlPrimero();
    expect(page.territorio()).toBe(5);
  });

  it('abre una manzana al tocarla en el mapa y marca el territorio', async () => {
    const { page } = await montar();
    const { EditorMapa } = await import('../../map/editor-map');
    const opciones = (EditorMapa.crear as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      clickManzana: (id: number, agregar: boolean) => void;
      clickVacio: () => void;
      dibujoTerminado: () => void;
    };
    opciones.clickManzana(3, false);
    expect(page.seleccion()).toEqual(new Set([3]));
    expect(page.territorio()).toBe(6);

    opciones.clickManzana(1, true);
    expect([...page.seleccion()].sort()).toEqual([1, 3]);
    expect(page.territorio()).toBe(6);
    opciones.clickManzana(1, true);
    expect([...page.seleccion()]).toEqual([3]);

    opciones.clickManzana(99, false);
    expect([...page.seleccion()]).toEqual([3]);

    opciones.clickVacio();
    expect(page.seleccion().size).toBe(0);

    opciones.dibujoTerminado();
    expect(page.dibujoListo()).toBe(true);
  });

  it('no toca la selección al tocar el mapa en modo dibujo', async () => {
    const { page } = await montar();
    const { EditorMapa } = await import('../../map/editor-map');
    const opciones = (EditorMapa.crear as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      clickManzana: (id: number, agregar: boolean) => void;
      clickVacio: () => void;
    };
    page.modo.set('dibujar');
    opciones.clickManzana(1, false);
    opciones.clickVacio();
    expect(page.seleccion().size).toBe(0);
  });

  it('marca y desmarca casillas de la lista', async () => {
    const { page } = await montar();
    page.alternarEnSeleccion(1, { target: { checked: true } } as unknown as Event);
    page.alternarEnSeleccion(2, { target: { checked: true } } as unknown as Event);
    expect([...page.seleccion()].sort()).toEqual([1, 2]);
    page.alternarEnSeleccion(1, { target: { checked: false } } as unknown as Event);
    expect([...page.seleccion()]).toEqual([2]);
    page.deseleccionar();
    expect(page.seleccion().size).toBe(0);
  });

  it('Escape cancela el dibujo o limpia la selección', async () => {
    const { page } = await montar();
    page.seleccion.set(new Set([1]));
    page.escape();
    expect(page.seleccion().size).toBe(0);

    page.modo.set('dibujar');
    page.escape();
    expect(page.modo()).toBe('ver');
    expect(editor.cancelarDibujo).toHaveBeenCalled();
  });

  it('prepara una manzana nueva con nombre sugerido', async () => {
    const { page } = await montar();
    page.nuevaManzana();
    expect(page.formTerritorio()).toBe(7);
    expect(page.formNombre()).toBe('7.a');
    expect(page.modo()).toBe('dibujar');
    expect(editor.dibujarNuevo).toHaveBeenCalled();

    page.elegirTerritorio(5);
    page.nuevaManzana();
    expect(page.formTerritorio()).toBe(5);
    expect(page.formNombre()).toBe('5.c');
  });

  it('edita vértices solo si hay manzana y el editor lo permite', async () => {
    const { page } = await montar();
    page.editarVertices();
    expect(editor.editarVertices).not.toHaveBeenCalled();

    page.seleccionarManzana(manzana(1, 5, '5.a'));
    editor.editarVertices.mockReturnValueOnce(false);
    page.editarVertices();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('no se puede editar'), 4000, 'warning');
    expect(page.modo()).toBe('ver');

    editor.editarVertices.mockReturnValueOnce(true);
    page.editarVertices();
    expect(page.modo()).toBe('vertices');
    expect(page.dibujoListo()).toBe(true);
  });

  it('redibuja la manzana abierta ocultando la anterior', async () => {
    const { page } = await montar();
    page.redibujar();
    expect(editor.dibujarNuevo).not.toHaveBeenCalled();

    page.seleccionarManzana(manzana(1, 5, '5.a'));
    page.redibujar();
    expect(editor.dibujarNuevo).toHaveBeenCalled();
    expect(editor.ocultar).toHaveBeenCalledWith(1);
    expect(page.modo()).toBe('redibujar');
  });

  it('cancela el dibujo y vuelve al modo ver', async () => {
    const { page } = await montar();
    page.modo.set('dibujar');
    page.dibujoListo.set(true);
    page.cancelarDibujo();
    expect(page.modo()).toBe('ver');
    expect(page.dibujoListo()).toBe(false);
  });

  it('no guarda sin territorio ni nombre, ni sin terminar el polígono', async () => {
    const { page } = await montar();
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Completá el número'), 4000, 'warning');

    page.formTerritorio.set(5);
    page.formNombre.set('   ');
    await page.guardar();
    expect(api['crearManzana']).not.toHaveBeenCalled();

    page.formNombre.set('5.c');
    page.modo.set('dibujar');
    editor.geometriaDibujada.mockReturnValueOnce(null);
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Terminá de dibujar'), 4000, 'warning');
    expect(api['crearManzana']).not.toHaveBeenCalled();
  });

  it('crea una manzana nueva con la geometría dibujada', async () => {
    const { page } = await montar();
    api['crearManzana'].mockResolvedValue(guardada(9, 5, '5.c'));
    page.formTerritorio.set(5);
    page.formNombre.set('5.c');
    page.modo.set('dibujar');
    editor.geometriaDibujada.mockReturnValueOnce(POLIGONO);
    await page.guardar();

    expect(api['crearManzana']).toHaveBeenCalledWith({ territorio: 5, nombre: '5.c', geometria: JSON.stringify(POLIGONO) });
    expect(page.store.manzanas()?.features.some(f => Number(f.id) === 9)).toBe(true);
    expect(page.seleccion()).toEqual(new Set([9]));
    expect(page.modo()).toBe('ver');
    expect(toast.show).toHaveBeenCalledWith('Manzana 5.c creada', 3000, 'success');
  });

  it('crea el primer territorio y recarga los colores', async () => {
    const { page } = await montar();
    api['crearManzana'].mockResolvedValue(guardada(9, 7, '7.a'));
    api['colores'].mockResolvedValue({ 5: '#ec4899', 7: '#22c55e' });
    page.formTerritorio.set(7);
    page.formNombre.set('7.a');
    await page.guardar();

    expect(api['colores']).toHaveBeenCalled();
    expect(page.store.colores()[7]).toBe('#22c55e');
  });

  it('actualiza una manzana existente sin geometría nueva', async () => {
    const { page } = await montar();
    api['actualizarManzana'].mockResolvedValue(guardada(1, 5, '5.a bis'));
    page.seleccionarManzana(manzana(1, 5, '5.a'));
    page.formNombre.set('5.a bis');
    await page.guardar();

    expect(api['actualizarManzana']).toHaveBeenCalledWith(1, { territorio: 5, nombre: '5.a bis', geometria: null });
    expect(toast.show).toHaveBeenCalledWith('Cambios guardados', 3000, 'success');
  });

  it('avisa de las manzanas con las que se superpone', async () => {
    const { page } = await montar();
    api['actualizarManzana'].mockResolvedValue(guardada(1, 5, '5.a', { solapaCon: [2, 99] }));
    page.seleccionarManzana(manzana(1, 5, '5.a'));
    await page.guardar();

    expect(toast.show).toHaveBeenCalledWith('Ojo: se superpone con 5.b, #99', 6000, 'warning');
  });

  it('avisa si el servidor rechaza el guardado', async () => {
    const { page } = await montar();
    api['actualizarManzana'].mockRejectedValue(new Error('caído'));
    page.seleccionarManzana(manzana(1, 5, '5.a'));
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 6000, 'error');
    expect(page.guardando()).toBe(false);
  });

  it('repara la geometría de la manzana abierta', async () => {
    const { page } = await montar();
    await page.reparar();
    expect(api['repararManzana']).not.toHaveBeenCalled();

    page.seleccionarManzana(manzana(1, 5, '5.a'));
    api['repararManzana'].mockResolvedValue(guardada(1, 5, '5.a', { valida: true }));
    await page.reparar();
    expect(toast.show).toHaveBeenCalledWith('Geometría reparada', 3000, 'success');

    api['repararManzana'].mockResolvedValue(guardada(1, 5, '5.a', { valida: false }));
    await page.reparar();
    expect(toast.show).toHaveBeenCalledWith('No se pudo reparar', 3000, 'warning');

    api['repararManzana'].mockRejectedValueOnce(new Error('caído'));
    await page.reparar();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 5000, 'error');
  });

  it('elimina la manzana abierta pidiendo confirmación', async () => {
    const { page } = await montar();
    await page.eliminarManzana();
    expect(ui.confirmar).not.toHaveBeenCalled();

    page.seleccionarManzana(manzana(1, 5, '5.a'));
    await page.eliminarManzana();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Eliminar la manzana 5.a', peligro: true }));
    expect(api['eliminarManzana']).toHaveBeenCalledWith(1);
    expect(page.store.manzanas()?.features.some(f => Number(f.id) === 1)).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('Manzana eliminada', 3000, 'success');
  });

  it('elimina varias manzanas marcadas', async () => {
    const { page } = await montar();
    page.seleccion.set(new Set([1, 2]));
    await page.eliminarSeleccion();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Eliminar 2 manzanas' }));
    expect(api['eliminarManzanas']).toHaveBeenCalledWith([1, 2]);
    expect(toast.show).toHaveBeenCalledWith('2 manzanas eliminadas', 3000, 'success');
    expect(page.seleccion().size).toBe(0);
  });

  it('no elimina si se cancela y avisa si falla', async () => {
    const { page } = await montar();
    page.seleccion.set(new Set([1, 2]));
    ui.confirmar.mockResolvedValueOnce(false);
    await page.eliminarSeleccion();
    expect(api['eliminarManzanas']).not.toHaveBeenCalled();

    ui.confirmar.mockResolvedValueOnce(true);
    api['eliminarManzanas'].mockRejectedValueOnce(new Error('caído'));
    await page.eliminarSeleccion();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 5000, 'error');
  });

  it('ofrece marcar el territorio completo cuando ya estaba todo predicado', async () => {
    const { page } = await montar();
    api['estadoTerritorio'].mockResolvedValue(estado(5, { manzanasIds: '5-5.b' }));
    page.seleccionarManzana(manzana(1, 5, '5.a'));
    await page.eliminarManzana();

    expect(ui.confirmar).toHaveBeenLastCalledWith(expect.objectContaining({ accion: 'Marcar completo' }));
    expect(api['corregir']).toHaveBeenCalledWith(
      expect.objectContaining({ territorio: 5, manzanasIds: '5-5.b', manzanasMarcadas: 1 }),
    );
    expect(toast.show).toHaveBeenCalledWith('Territorio 5 marcado como completo', 3000, 'success');
  });

  it('no ofrece completar si falta predicar, si el estado falla o si se cancela', async () => {
    const { page } = await montar();
    page.seleccionarManzana(manzana(1, 5, '5.a'));

    api['estadoTerritorio'].mockResolvedValueOnce(estado(5, { manzanasIds: null }));
    await page.eliminarManzana();
    expect(api['corregir']).not.toHaveBeenCalled();

    api['estadoTerritorio'].mockRejectedValueOnce(new Error('caído'));
    await page.eliminarManzana();
    expect(api['corregir']).not.toHaveBeenCalled();

    api['estadoTerritorio'].mockResolvedValueOnce(estado(5, { manzanasIds: '5-5.b' }));
    ui.confirmar.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await page.eliminarManzana();
    expect(api['corregir']).not.toHaveBeenCalled();
  });

  it('avisa si falla la corrección al completar', async () => {
    const { page } = await montar();
    api['estadoTerritorio'].mockResolvedValue(estado(5, { manzanasIds: '5-5.b' }));
    api['corregir'].mockRejectedValue(new Error('caído'));
    page.seleccionarManzana(manzana(1, 5, '5.a'));
    await page.eliminarManzana();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 5000, 'error');
  });

  it('mueve las manzanas marcadas a otro territorio', async () => {
    const { page } = await montar();
    await page.moverSeleccion();
    expect(ui.confirmar).not.toHaveBeenCalled();

    page.seleccion.set(new Set([1]));
    page.destinoMover.set(6);
    await page.moverSeleccion();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Mover 1 manzana(s) al territorio 6' }));
    expect(api['reasignarManzanas']).toHaveBeenCalledWith([1], 6);
    expect(page.store.manzanas()?.features.find(f => Number(f.id) === 1)?.properties.territorio).toBe(6);
    expect(page.territorio()).toBe(6);
    expect(page.destinoMover()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Manzanas movidas al territorio 6', 3000, 'success');
  });

  it('crea el territorio destino al mover y avisa si falla', async () => {
    const { page } = await montar();
    page.seleccion.set(new Set([1]));
    page.destinoMover.set(9);
    await page.moverSeleccion();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('no existe todavía') }));
    expect(api['colores']).toHaveBeenCalled();

    page.seleccion.set(new Set([2]));
    page.destinoMover.set(6);
    api['reasignarManzanas'].mockRejectedValueOnce(new Error('caído'));
    await page.moverSeleccion();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 6000, 'error');
  });

  it('no mueve si se cancela la confirmación', async () => {
    const { page } = await montar();
    page.seleccion.set(new Set([1]));
    page.destinoMover.set(6);
    ui.confirmar.mockResolvedValueOnce(false);
    await page.moverSeleccion();
    expect(api['reasignarManzanas']).not.toHaveBeenCalled();
  });

  it('elimina un territorio entero pidiendo escribir su número', async () => {
    const { page } = await montar();
    await page.eliminarTerritorio();
    expect(ui.confirmar).not.toHaveBeenCalled();

    page.elegirTerritorio(5);
    await page.eliminarTerritorio();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ escribir: '5', peligro: true }));
    expect(api['eliminarTerritorio']).toHaveBeenCalledWith(5);
    expect(page.store.manzanas()?.features.some(f => f.properties.territorio === 5)).toBe(false);
    expect(page.territorio()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Territorio 5 eliminado', 3000, 'success');
  });

  it('no elimina el territorio si se cancela y avisa si falla', async () => {
    const { page } = await montar();
    page.elegirTerritorio(5);
    ui.confirmar.mockResolvedValueOnce(false);
    await page.eliminarTerritorio();
    expect(api['eliminarTerritorio']).not.toHaveBeenCalled();

    ui.confirmar.mockResolvedValueOnce(true);
    api['eliminarTerritorio'].mockRejectedValueOnce(new Error('caído'));
    await page.eliminarTerritorio();
    expect(toast.show).toHaveBeenCalledWith('No se pudo completar la operación', 5000, 'error');
  });

  it('cambia el color del territorio y lo revierte si falla', async () => {
    const { page } = await montar();
    await page.cambiarColor('#000000');
    expect(api['asignarColor']).not.toHaveBeenCalled();

    page.elegirTerritorio(6);
    await page.cambiarColor('#22c55e');
    expect(api['asignarColor']).toHaveBeenCalledWith(6, '#22c55e');
    expect(page.store.colores()[6]).toBe('#22c55e');

    api['asignarColor'].mockRejectedValueOnce(new Error('caído'));
    await page.cambiarColor('#ffffff');
    expect(page.store.colores()[6]).toBe('#22c55e');
    expect(toast.show).toHaveBeenCalledWith('No se pudo guardar el color', 4000, 'error');
  });

  it('abre el selector de archivo', async () => {
    const { fixture, page } = await montar();
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    page.elegirArchivo();
    expect(click).toHaveBeenCalled();
  });

  it('importa un archivo GeoJSON tras confirmar', async () => {
    const { page } = await montar();
    api['importarManzanas'].mockResolvedValue({ creadas: 3, territorios: [5, 6] });
    const archivo = { name: 'manzanas.geojson', text: () => Promise.resolve('{"type":"FeatureCollection"}') };
    await page.importar({ target: { files: [archivo], value: 'x' } } as unknown as Event);

    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Importar manzanas.geojson' }));
    expect(api['importarManzanas']).toHaveBeenCalledWith('{"type":"FeatureCollection"}');
    expect(toast.show).toHaveBeenCalledWith('3 manzanas importadas en 2 territorio(s)', 4000, 'success');
  });

  it('no importa sin archivo, si se cancela, y avisa si falla', async () => {
    const { page } = await montar();
    await page.importar({ target: { files: null, value: '' } } as unknown as Event);
    expect(ui.confirmar).not.toHaveBeenCalled();

    const archivo = { name: 'a.geojson', text: () => Promise.resolve('{}') };
    ui.confirmar.mockResolvedValueOnce(false);
    await page.importar({ target: { files: [archivo], value: '' } } as unknown as Event);
    expect(api['importarManzanas']).not.toHaveBeenCalled();

    ui.confirmar.mockResolvedValueOnce(true);
    api['importarManzanas'].mockRejectedValueOnce(new Error('caído'));
    await page.importar({ target: { files: [archivo], value: '' } } as unknown as Event);
    expect(toast.show).toHaveBeenCalledWith('No se pudo importar el archivo', 10000, 'error');
  });

  it('exporta las manzanas como GeoJSON', async () => {
    const { page } = await montar();
    const crear = vi.fn().mockReturnValue('blob:x');
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi.fn();
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = click;
    page.exportar();
    HTMLAnchorElement.prototype.click = original;
    expect(crear).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('no exporta si todavía no hay manzanas', async () => {
    const { page } = await montar();
    page.store.manzanas.set(null);
    const crear = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true });
    page.exportar();
    expect(crear).not.toHaveBeenCalled();
  });

  it('va a una manzana por id y cambia el fondo del mapa', async () => {
    const { page } = await montar();
    page.irAManzana(99);
    expect(page.seleccion().size).toBe(0);
    page.irAManzana(2);
    expect(page.manzana()?.properties.nombre).toBe('5.b');

    page.setFondo('satelite');
    expect(page.fondo()).toBe('satelite');
    expect(editor.setFondo).toHaveBeenCalledWith('satelite');
  });

  it('resuelve nombres, números y textos del formulario', async () => {
    const { page } = await montar();
    expect(page.nombreDe(1)).toBe('5.a (T5)');
    expect(page.nombreDe(99)).toBe('#99');
    expect(page.numero({ target: { value: ' 12 ' } } as unknown as Event)).toBe(12);
    expect(page.numero({ target: { value: '' } } as unknown as Event)).toBeNull();
    expect(page.numero({ target: { value: 'x' } } as unknown as Event)).toBeNull();
    expect(page.texto({ target: { value: 'hola' } } as unknown as Event)).toBe('hola');
    expect(page.fmtArea(1_500_000)).toContain('km²');
    expect(page.fmtArea(1200)).toContain('m²');
  });

  it('sugiere el nombre al cambiar el territorio mientras dibuja', async () => {
    const { page } = await montar();
    page.onTerritorioForm({ target: { value: '6' } } as unknown as Event);
    expect(page.formTerritorio()).toBe(6);
    expect(page.formNombre()).toBe('');

    page.modo.set('dibujar');
    page.onTerritorioForm({ target: { value: '6' } } as unknown as Event);
    expect(page.formNombre()).toBe('6.b');
  });

  it('normaliza la búsqueda de manzanas', () => {
    expect(normalizarBusqueda(' 85 C ')).toBe('85.c');
    expect(normalizarBusqueda('85c')).toBe('85.c');
    expect(normalizarBusqueda('85.c')).toBe('85.c');
    expect(normalizarBusqueda('')).toBe('');
  });

  it('destruye el editor al salir de la página', async () => {
    const { fixture } = await montar();
    fixture.destroy();
    expect(editor.destruir).toHaveBeenCalled();
  });
});
