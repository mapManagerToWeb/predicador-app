import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import type { EncargadoAdmin, ResultadoImportacion } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { EncargadosPage, claveNombre, claveTelefono, posiblesDuplicados } from './encargados';

function encargado(
  id: number,
  nombre: string,
  apellido: string,
  telefono: string | null,
  extra: Partial<EncargadoAdmin> = {},
): EncargadoAdmin {
  return {
    id, nombre, apellido, telefono, avatar: 1, activo: true, tienePin: false, pinActualizadoEn: null,
    bloqueadoHasta: null, ultimoAcceso: null, creadoEn: null, totalReportes: 0, ultimoReporte: null,
    ...extra,
  };
}

describe('detección de encargados duplicados', () => {
  it('normaliza teléfonos con y sin +56 y nombres con tildes', () => {
    expect(claveTelefono('+56 9 9137 0779')).toBe('991370779');
    expect(claveTelefono('991370779')).toBe('991370779');
    expect(claveNombre({ nombre: 'Matías ', apellido: 'Pérez' })).toBe('matias perez');
  });

  it('marca a los que comparten teléfono o nombre', () => {
    const motivos = posiblesDuplicados([
      encargado(5, 'Bastian', 'Sandoval', '991370779'),
      encargado(16, 'Bastian', 'Sandoval', '56991370779'),
      encargado(3, 'Marco', 'Rojas', '56940282369'),
      encargado(8, 'marco', 'rojas', null),
    ]);
    expect(motivos.has(5)).toBe(true);
    expect(motivos.has(16)).toBe(true);
    expect(motivos.get(8)).toContain('nombre');
    expect(motivos.get(3)).toContain('nombre');
  });

  it('no marca a encargados distintos', () => {
    expect(posiblesDuplicados([encargado(1, 'Ana', 'Uno', '911111111'), encargado(2, 'Eva', 'Dos', null)]).size).toBe(0);
  });
});

type Senal<T> = ReturnType<typeof signal<T>>;

interface VistaEncargados {
  cargando: Senal<boolean>;
  error: Senal<string | null>;
  registroAbierto: Senal<boolean | null>;
  busqueda: Senal<string>;
  filtroEstado: Senal<string>;
  filtroAcceso: Senal<string>;
  seleccionadoId: Senal<number | null>;
  formulario: Senal<{ id: number | null; nombre: string; apellido: string; telefono: string; activo: boolean } | null>;
  guardando: Senal<boolean>;
  pinMostrado: Senal<{ encargado: EncargadoAdmin; pin: string } | null>;
  destinoFusion: Senal<number | null>;
  cargandoLista: Senal<boolean>;
  textoLista: Senal<string>;
  revision: Senal<ResultadoImportacion[] | null>;
  procesandoLista: Senal<boolean>;
  conteoRevision(): { crear: number; existe: number; error: number };
  lista(): EncargadoAdmin[];
  duplicados(): Map<number, string>;
  filtrados(): EncargadoAdmin[];
  seleccionado(): EncargadoAdmin | null;
  totales(): { activos: number; conPin: number; sinPin: number; bloqueados: number };
  cargar(forzar?: boolean): Promise<void>;
  acceso(e: EncargadoAdmin): string;
  alternarRegistro(): Promise<void>;
  abrirCargaDeLista(): void;
  cerrarCargaDeLista(): void;
  escribirLista(texto: string): void;
  leerArchivo(event: Event): Promise<void>;
  revisarLista(): Promise<void>;
  crearDeLaLista(): Promise<void>;
  nuevo(): void;
  editar(e: EncargadoAdmin): void;
  campo(nombre: string, event: Event): void;
  guardar(): Promise<void>;
  generarPin(e: EncargadoAdmin): Promise<void>;
  quitarPin(e: EncargadoAdmin): Promise<void>;
  desbloquear(e: EncargadoAdmin): Promise<void>;
  alternarActivo(e: EncargadoAdmin): Promise<void>;
  fusionar(origen: EncargadoAdmin): Promise<void>;
  eliminar(e: EncargadoAdmin): Promise<void>;
  copiarPin(): void;
  enlaceWhatsApp(e: EncargadoAdmin, pin: string): string | null;
  exportar(): void;
  idElegido(event: Event): number | null;
  texto(event: Event): string;
  telefonoInvalido(e: EncargadoAdmin): boolean;
}

function conPin(id: number, nombre: string, apellido: string, telefono: string, extra: Partial<EncargadoAdmin> = {}): EncargadoAdmin {
  return { ...encargado(id, nombre, apellido, telefono), tienePin: true, ...extra };
}

describe('EncargadosPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ui: { confirmar: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: {
    encargados: Senal<EncargadoAdmin[] | null>;
    cargarEncargados: ReturnType<typeof vi.fn>;
    cargarReportes: ReturnType<typeof vi.fn>;
  };
  const base = [
    encargado(5, 'Bastian', 'Sandoval', '991370779'),
    conPin(16, 'Bastian', 'Sandoval', '56991370779'),
    encargado(3, 'Marco', 'Rojas', '56940282369', { bloqueadoHasta: '2026-11-20T10:00:00Z' }),
    encargado(8, 'Ana', 'Pérez', null),
  ];

  async function montar(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<EncargadosPage>>; page: VistaEncargados }> {
    const fixture = TestBed.createComponent(EncargadosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, page: fixture.componentInstance as unknown as VistaEncargados };
  }

  beforeEach(async () => {
    api = {
      configuracion: vi.fn().mockResolvedValue({ registroAbierto: true }),
      setRegistroAbierto: vi.fn().mockResolvedValue({ registroAbierto: false }),
      importarEncargados: vi.fn(),
      crearEncargado: vi.fn(),
      actualizarEncargado: vi.fn(),
      eliminarEncargado: vi.fn(),
      generarPin: vi.fn().mockResolvedValue({ pin: '123456' }),
      quitarPin: vi.fn(),
      desbloquearEncargado: vi.fn(),
      fusionarEncargados: vi.fn(),
    };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    store = {
      encargados: signal<EncargadoAdmin[] | null>(base.map(e => ({ ...e }))),
      cargarEncargados: vi.fn().mockResolvedValue(undefined),
      cargarReportes: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [EncargadosPage],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: AdminUi, useValue: ui },
        { provide: Toast, useValue: toast },
      ],
    })
      .overrideComponent(EncargadosPage, { set: { template: '', imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  it('carga los encargados y el estado del registro', async () => {
    const { page } = await montar();
    expect(store.cargarEncargados).toHaveBeenCalled();
    expect(api['configuracion']).toHaveBeenCalled();
    expect(page.registroAbierto()).toBe(true);
    expect(page.cargando()).toBe(false);
    expect(page.lista()).toHaveLength(4);
  });

  it('guarda el mensaje cuando falla la carga', async () => {
    store.cargarEncargados.mockRejectedValue(new Error('sin red'));
    const { page } = await montar();
    expect(page.error()).toContain('No se pudieron cargar');
    expect(page.cargando()).toBe(false);
  });

  it('calcula duplicados, totales y la selección actual', async () => {
    const { page } = await montar();
    expect(page.duplicados().get(5)).toContain('Mismo');
    expect(page.totales()).toEqual({ activos: 4, conPin: 1, sinPin: 3, bloqueados: 1 });
    expect(page.seleccionado()).toBeNull();
    page.seleccionadoId.set(3);
    expect(page.seleccionado()?.nombre).toBe('Marco');
  });

  it('filtra por nombre, teléfono, estado y tipo de acceso', async () => {
    const { page } = await montar();
    page.busqueda.set('marco');
    expect(page.filtrados().map(e => e.id)).toEqual([3]);

    page.busqueda.set('9913');
    expect(page.filtrados().map(e => e.id)).toEqual([5, 16]);

    page.busqueda.set('');
    page.filtroEstado.set('activos');
    expect(page.filtrados()).toHaveLength(4);

    page.filtroAcceso.set('pin');
    expect(page.filtrados().map(e => e.id)).toEqual([16]);

    page.filtroAcceso.set('bloqueado');
    expect(page.filtrados().map(e => e.id)).toEqual([3]);

    page.filtroAcceso.set('telefono');
    expect(page.filtrados().map(e => e.id)).toEqual([5, 8]);

    store.encargados.set([{ ...base[0], activo: false }]);
    page.filtroAcceso.set('todos');
    page.filtroEstado.set('inactivos');
    expect(page.filtrados().map(e => e.id)).toEqual([5]);
  });

  it('abre y cierra el registro pidiendo confirmación', async () => {
    const { page } = await montar();
    await page.alternarRegistro();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Cerrar registro' }));
    expect(api['setRegistroAbierto']).toHaveBeenCalledWith(false);
    expect(page.registroAbierto()).toBe(false);
  });

  it('no cambia el registro si se cancela o si falla', async () => {
    const { page } = await montar();
    ui.confirmar.mockResolvedValueOnce(false);
    await page.alternarRegistro();
    expect(api['setRegistroAbierto']).not.toHaveBeenCalled();

    api['setRegistroAbierto'].mockRejectedValueOnce(new Error('caído'));
    await page.alternarRegistro();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'error');
  });

  it('lee una lista de un archivo y la cierra limpiando el texto', async () => {
    const { page } = await montar();
    page.abrirCargaDeLista();
    expect(page.cargandoLista()).toBe(true);
    expect(page.formulario()).toBeNull();

    await page.leerArchivo({ target: { files: [{ text: () => Promise.resolve('Ana Pérez, 912345678') }], value: 'x' } } as unknown as Event);
    expect(page.textoLista()).toBe('Ana Pérez, 912345678');
    expect(page.revision()).toBeNull();

    await page.leerArchivo({ target: { files: null, value: '' } } as unknown as Event);
    expect(page.textoLista()).toBe('Ana Pérez, 912345678');

    page.cerrarCargaDeLista();
    expect(page.cargandoLista()).toBe(false);
    expect(page.textoLista()).toBe('');
  });

  it('revisa la lista en el servidor y cuenta los resultados', async () => {
    const { page } = await montar();
    page.escribirLista('Ana Pérez, 912345678');
    api['importarEncargados'].mockResolvedValue([
      { fila: 1, nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', resultado: 'crear', detalle: '' },
      { fila: 2, nombre: 'Luis', apellido: 'Rojas', telefono: '912345678', resultado: 'existe', detalle: '' },
      { fila: 3, nombre: 'X', apellido: 'Y', telefono: null, resultado: 'error', detalle: 'teléfono inválido' },
    ]);
    await page.revisarLista();
    expect(api['importarEncargados']).toHaveBeenCalledWith([{ nombre: 'Ana', apellido: 'Pérez', telefono: '912345678' }], true);
    expect(page.conteoRevision()).toEqual({ crear: 1, existe: 1, error: 1 });
    expect(page.procesandoLista()).toBe(false);
  });

  it('avisa si la lista está vacía y si la revisión falla', async () => {
    const { page } = await montar();
    await page.revisarLista();
    expect(toast.show).toHaveBeenCalledWith('La lista está vacía.', 3000, 'warning');

    page.escribirLista('Ana Pérez, 912345678');
    api['importarEncargados'].mockRejectedValue(new Error('caído'));
    await page.revisarLista();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
    expect(page.procesandoLista()).toBe(false);
  });

  it('crea los hermanos de la lista y deja a la vista solo los que fallaron', async () => {
    const { page } = await montar();
    page.escribirLista('Ana Pérez, 912345678\nLuis Rojas, 923456789');
    api['importarEncargados']
      .mockResolvedValueOnce([
        { fila: 1, nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', resultado: 'crear', detalle: '' },
        { fila: 2, nombre: 'Luis', apellido: 'Rojas', telefono: '923456789', resultado: 'error', detalle: 'duplicado' },
      ])
      .mockResolvedValueOnce([
        { fila: 1, nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', resultado: 'crear', detalle: '' },
        { fila: 2, nombre: 'Luis', apellido: 'Rojas', telefono: '923456789', resultado: 'error', detalle: 'duplicado' },
      ]);
    await page.revisarLista();
    await page.crearDeLaLista();

    expect(api['importarEncargados']).toHaveBeenLastCalledWith(
      [
        { nombre: 'Ana', apellido: 'Pérez', telefono: '912345678' },
        { nombre: 'Luis', apellido: 'Rojas', telefono: '923456789' },
      ],
      false,
    );
    expect(store.cargarEncargados).toHaveBeenCalledWith(true);
    expect(toast.show).toHaveBeenCalledWith('Se creó 1 hermano', 4000, 'success');
    expect(page.revision()).toHaveLength(1);
    expect(page.revision()?.[0].resultado).toBe('error');
  });

  it('cierra la carga de lista cuando todo se creó, y no hace nada sin filas para crear', async () => {
    const { page } = await montar();
    page.abrirCargaDeLista();
    page.escribirLista('Ana Pérez, 912345678');
    api['importarEncargados'].mockResolvedValue([
      { fila: 1, nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', resultado: 'crear', detalle: '' },
    ]);
    await page.revisarLista();
    await page.crearDeLaLista();
    expect(page.cargandoLista()).toBe(false);

    page.escribirLista('');
    page.revision.set([{ fila: 1, nombre: 'A', apellido: 'B', telefono: null, resultado: 'existe', detalle: '' }]);
    const llamadas = api['importarEncargados'].mock.calls.length;
    await page.crearDeLaLista();
    expect(api['importarEncargados'].mock.calls).toHaveLength(llamadas);
  });

  it('no crea nada si se cancela la confirmación y avisa si falla', async () => {
    const { page } = await montar();
    page.escribirLista('Ana Pérez, 912345678');
    api['importarEncargados'].mockResolvedValue([
      { fila: 1, nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', resultado: 'crear', detalle: '' },
    ]);
    await page.revisarLista();

    ui.confirmar.mockResolvedValueOnce(false);
    await page.crearDeLaLista();
    expect(api['importarEncargados']).toHaveBeenCalledTimes(1);

    ui.confirmar.mockResolvedValueOnce(true);
    api['importarEncargados'].mockRejectedValueOnce(new Error('caído'));
    await page.crearDeLaLista();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('abre el formulario de alta y de edición', async () => {
    const { page } = await montar();
    page.nuevo();
    expect(page.formulario()).toEqual({ id: null, nombre: '', apellido: '', telefono: '', activo: true });

    page.editar(base[0]);
    expect(page.formulario()).toEqual({
      id: 5,
      nombre: 'Bastian',
      apellido: 'Sandoval',
      telefono: '991370779',
      activo: true,
    });
  });

  it('actualiza el formulario según el campo, incluido el checkbox', async () => {
    const { page } = await montar();
    page.nuevo();
    page.campo('nombre', { target: { type: 'text', value: 'Ana' } } as unknown as Event);
    expect(page.formulario()?.nombre).toBe('Ana');
    page.campo('activo', { target: { type: 'checkbox', checked: false } } as unknown as Event);
    expect(page.formulario()?.activo).toBe(false);
    page.formulario.set(null);
    page.campo('nombre', { target: { type: 'text', value: 'X' } } as unknown as Event);
    expect(page.formulario()).toBeNull();
  });

  it('valida los campos obligatorios y el celular antes de guardar', async () => {
    const { page } = await montar();
    await page.guardar();
    expect(toast.show).not.toHaveBeenCalled();

    page.nuevo();
    page.formulario.set({ id: null, nombre: 'Ana', apellido: 'Pérez', telefono: '', activo: true });
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith('Nombre, apellido y teléfono son obligatorios.', 4000, 'warning');

    page.formulario.set({ id: null, nombre: 'Ana', apellido: 'Pérez', telefono: '123', activo: true });
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('9 dígitos'), 5000, 'warning');
    expect(api['crearEncargado']).not.toHaveBeenCalled();
  });

  it('crea un encargado nuevo y lo deja seleccionado', async () => {
    const { page } = await montar();
    const creado = encargado(99, 'Ana', 'Pérez', '912345678');
    api['crearEncargado'].mockResolvedValue(creado);
    page.nuevo();
    page.formulario.set({ id: null, nombre: ' Ana ', apellido: ' Pérez ', telefono: ' 912345678 ', activo: true });
    await page.guardar();

    expect(api['crearEncargado']).toHaveBeenCalledWith({ nombre: 'Ana', apellido: 'Pérez', telefono: '912345678', activo: true });
    expect(page.lista().some(e => e.id === 99)).toBe(true);
    expect(page.seleccionadoId()).toBe(99);
    expect(page.formulario()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Encargado creado', 3000, 'success');
  });

  it('actualiza un encargado existente y avisa si falla', async () => {
    const { page } = await montar();
    api['actualizarEncargado'].mockResolvedValue({ ...base[0], nombre: 'Bastian2' });
    page.editar(base[0]);
    page.formulario.update(f => (f ? { ...f, nombre: 'Bastian2' } : f));
    await page.guardar();
    expect(api['actualizarEncargado']).toHaveBeenCalledWith(5, expect.objectContaining({ nombre: 'Bastian2' }));
    expect(page.lista().find(e => e.id === 5)?.nombre).toBe('Bastian2');
    expect(toast.show).toHaveBeenCalledWith('Cambios guardados', 3000, 'success');

    api['actualizarEncargado'].mockRejectedValueOnce(new Error('caído'));
    page.editar(base[0]);
    await page.guardar();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('genera un PIN y lo deja a la vista', async () => {
    const { page } = await montar();
    await page.generarPin(base[0]);
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Generar PIN' }));
    expect(page.pinMostrado()).toEqual({ encargado: base[0], pin: '123456' });
    expect(store.cargarEncargados).toHaveBeenCalledWith(true);
  });

  it('no genera PIN si se cancela y avisa si falla', async () => {
    const { page } = await montar();
    ui.confirmar.mockResolvedValueOnce(false);
    await page.generarPin(base[0]);
    expect(page.pinMostrado()).toBeNull();

    api['generarPin'].mockRejectedValueOnce(new Error('caído'));
    await page.generarPin(base[0]);
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'error');
  });

  it('quita el PIN, desbloquea y avisa cuando falla', async () => {
    const { page } = await montar();
    api['quitarPin'].mockResolvedValue({ ...base[0], tienePin: false });
    await page.quitarPin(base[0]);
    expect(toast.show).toHaveBeenCalledWith('PIN quitado', 3000, 'success');

    api['desbloquearEncargado'].mockResolvedValue({ ...base[0], bloqueadoHasta: null });
    await page.desbloquear(base[0]);
    expect(toast.show).toHaveBeenCalledWith('Bastian desbloqueado', 3000, 'success');

    api['desbloquearEncargado'].mockRejectedValueOnce(new Error('caído'));
    await page.desbloquear(base[0]);
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('desactiva y reactiva a un encargado', async () => {
    const { page } = await montar();
    api['actualizarEncargado'].mockResolvedValue({ ...base[0], activo: false });
    await page.alternarActivo(base[0]);
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Desactivar' }));
    expect(api['actualizarEncargado']).toHaveBeenCalledWith(5, expect.objectContaining({ activo: false }));
    expect(toast.show).toHaveBeenCalledWith('Encargado desactivado', 3000, 'success');

    api['actualizarEncargado'].mockResolvedValue({ ...base[0], activo: true });
    await page.alternarActivo({ ...base[0], activo: false });
    expect(toast.show).toHaveBeenCalledWith('Encargado activado', 3000, 'success');
  });

  it('no desactiva si se cancela la confirmación', async () => {
    const { page } = await montar();
    ui.confirmar.mockResolvedValueOnce(false);
    await page.alternarActivo(base[0]);
    expect(api['actualizarEncargado']).not.toHaveBeenCalled();
  });

  it('fusiona dos encargados y deja seleccionado el destino', async () => {
    const { page } = await montar();
    page.destinoFusion.set(3);
    await page.fusionar(base[0]);
    expect(api['fusionarEncargados']).toHaveBeenCalledWith(5, 3);
    expect(store.cargarReportes).toHaveBeenCalledWith(true);
    expect(page.destinoFusion()).toBeNull();
    expect(page.seleccionadoId()).toBe(3);
    expect(toast.show).toHaveBeenCalledWith('Encargados fusionados', 3000, 'success');
  });

  it('no fusiona sin destino, si se cancela, o si falla', async () => {
    const { page } = await montar();
    await page.fusionar(base[0]);
    expect(ui.confirmar).not.toHaveBeenCalled();

    page.destinoFusion.set(3);
    ui.confirmar.mockResolvedValueOnce(false);
    await page.fusionar(base[0]);
    expect(api['fusionarEncargados']).not.toHaveBeenCalled();

    api['fusionarEncargados'].mockRejectedValueOnce(new Error('caído'));
    await page.fusionar(base[0]);
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('elimina a un encargado y lo saca de la lista', async () => {
    const { page } = await montar();
    api['eliminarEncargado'].mockResolvedValue(undefined);
    await page.eliminar(base[3]);
    expect(api['eliminarEncargado']).toHaveBeenCalledWith(8);
    expect(page.lista().some(e => e.id === 8)).toBe(false);
    expect(page.seleccionadoId()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Encargado eliminado', 3000, 'success');
  });

  it('no elimina si se cancela y avisa si falla', async () => {
    const { page } = await montar();
    ui.confirmar.mockResolvedValueOnce(false);
    await page.eliminar(base[3]);
    expect(api['eliminarEncargado']).not.toHaveBeenCalled();

    api['eliminarEncargado'].mockRejectedValueOnce(new Error('tiene reportes'));
    await page.eliminar(base[3]);
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('copia el PIN al portapapeles', async () => {
    const { page } = await montar();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    page.pinMostrado.set({ encargado: base[0], pin: '999' });
    page.copiarPin();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('999');
    expect(toast.show).toHaveBeenCalledWith('PIN copiado', 2000, 'success');

    page.pinMostrado.set(null);
    page.copiarPin();
  });

  it('arma el enlace de WhatsApp solo con un teléfono usable', () => {
    const page = TestBed.createComponent(EncargadosPage).componentInstance as unknown as VistaEncargados;
    const enlace = page.enlaceWhatsApp(base[0], '123456');
    expect(enlace).toContain('https://wa.me/56991370779?text=');
    expect(enlace).toContain(encodeURIComponent('Bastian'));
    expect(page.enlaceWhatsApp({ ...base[0], telefono: '123' }, '1')).toBeNull();
    expect(page.enlaceWhatsApp({ ...base[0], telefono: null }, '1')).toBeNull();
  });

  it('exporta la lista a CSV', async () => {
    const { page } = await montar();
    const crear = vi.fn().mockReturnValue('blob:x');
    const revocar = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revocar, configurable: true });
    const click = vi.fn();
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = click;
    page.exportar();
    HTMLAnchorElement.prototype.click = original;
    expect(crear).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('lee el id elegido y el texto del evento', () => {
    const page = TestBed.createComponent(EncargadosPage).componentInstance as unknown as VistaEncargados;
    expect(page.idElegido({ target: { value: '7' } } as unknown as Event)).toBe(7);
    expect(page.idElegido({ target: { value: '0' } } as unknown as Event)).toBeNull();
    expect(page.idElegido({ target: { value: 'x' } } as unknown as Event)).toBeNull();
    expect(page.texto({ target: { value: 'hola' } } as unknown as Event)).toBe('hola');
  });

  it('marca los teléfonos que no son celulares chilenos', () => {
    const page = TestBed.createComponent(EncargadosPage).componentInstance as unknown as VistaEncargados;
    expect(page.telefonoInvalido(base[0])).toBe(false);
    expect(page.telefonoInvalido({ ...base[0], telefono: '12345' })).toBe(true);
    expect(page.telefonoInvalido({ ...base[0], telefono: null })).toBe(true);
  });
});
