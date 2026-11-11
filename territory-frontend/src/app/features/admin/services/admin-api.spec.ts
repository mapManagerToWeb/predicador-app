import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminApi, mensajeDeError } from './admin-api';

describe('AdminApi', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('todas las peticiones saltan el service worker', async () => {
    const promesa = api.manzanas();
    const req = http.expectOne('/api/v1/territories/admin/manzanas');
    expect(req.request.headers.get('ngsw-bypass')).toBe('true');
    req.flush({ type: 'FeatureCollection', features: [] });
    await expect(promesa).resolves.toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('pide los reportes por rango en ISO y borra por ids', async () => {
    const desde = new Date('2026-01-01T03:00:00Z');
    const hasta = new Date('2026-02-01T03:00:00Z');
    const lista = api.reportesEntre(desde, hasta);
    const req = http.expectOne(r => r.url === '/api/v1/reports/admin');
    expect(req.request.params.get('desde')).toBe('2026-01-01T03:00:00.000Z');
    expect(req.request.params.get('hasta')).toBe('2026-02-01T03:00:00.000Z');
    req.flush([]);
    await lista;

    const borrado = api.eliminarReportes([3, 4]);
    const del = http.expectOne(r => r.url === '/api/v1/reports/admin' && r.method === 'DELETE');
    expect(del.request.params.get('ids')).toBe('3,4');
    del.flush({ eliminados: 2 });
    await expect(borrado).resolves.toEqual({ eliminados: 2 });
  });

  it('los colores se piden sin la copia cacheada del navegador', async () => {
    const promesa = api.colores();
    const req = http.expectOne(r => r.url === '/api/v1/territories/colors');
    expect(req.request.params.has('v')).toBe(true);
    req.flush({ 1: '#ff0000' });
    await promesa;
  });

  it('importar manda el archivo tal cual como JSON', async () => {
    const promesa = api.importarManzanas('{"type":"FeatureCollection","features":[]}');
    const req = http.expectOne('/api/v1/territories/admin/importar');
    expect(req.request.body).toBe('{"type":"FeatureCollection","features":[]}');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush({ creadas: 0, territorios: [] });
    await promesa;
  });
});

describe('mensajeDeError', () => {
  const error = (status: number, cuerpo: unknown) => new HttpErrorResponse({ status, error: cuerpo });

  it('usa el detail del ProblemDetail', () => {
    expect(mensajeDeError(error(409, { detail: 'El territorio 5 ya tiene una manzana llamada 5.a' }))).toBe(
      'El territorio 5 ya tiene una manzana llamada 5.a',
    );
  });

  it('junta los errores de validación', () => {
    const cuerpo = { detail: 'Error de validación', errors: [{ field: 'nombre', message: 'nombre es obligatorio' }] };
    expect(mensajeDeError(error(400, cuerpo))).toBe('nombre es obligatorio');
  });

  it('explica la falta de conexión y cae al mensaje por defecto', () => {
    expect(mensajeDeError(error(0, null))).toContain('Servidor no disponible');
    expect(mensajeDeError(new Error('x'), 'Algo falló')).toBe('Algo falló');
  });
});

describe('AdminApi · endpoints restantes', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  type Caso = [nombre: string, invocar: (a: AdminApi) => Promise<unknown>, metodo: string, url: string];

  const casos: Caso[] = [
    ['crear manzana', a => a.crearManzana({} as never), 'POST', '/api/v1/territories/admin/manzanas'],
    ['actualizar manzana', a => a.actualizarManzana(7, {} as never), 'PUT', '/api/v1/territories/admin/manzanas/7'],
    ['eliminar manzana', a => a.eliminarManzana(7), 'DELETE', '/api/v1/territories/admin/manzanas/7'],
    ['eliminar varias manzanas', a => a.eliminarManzanas([1, 2]), 'DELETE', '/api/v1/territories/admin/manzanas'],
    ['reparar manzana', a => a.repararManzana(7), 'POST', '/api/v1/territories/admin/manzanas/7/reparar'],
    ['reasignar manzanas', a => a.reasignarManzanas([1, 2], 9), 'POST', '/api/v1/territories/admin/manzanas/reasignar'],
    ['eliminar territorio', a => a.eliminarTerritorio(5), 'DELETE', '/api/v1/territories/admin/territorios/5'],
    ['calidad de datos', a => a.calidad(), 'GET', '/api/v1/territories/admin/calidad'],
    ['asignar color', a => a.asignarColor(5, '#fff'), 'PUT', '/api/v1/territories/5/color'],
    ['envíos de whatsapp', a => a.enviosWhatsApp(), 'GET', '/api/v1/reports/admin/whatsapp'],
    ['ciclos', a => a.ciclos(), 'GET', '/api/v1/reports/admin/ciclos'],
    ['cerrar ciclo', a => a.cerrarCiclo(null), 'POST', '/api/v1/reports/admin/ciclos/cerrar'],
    ['cambiar inicio de ciclo', a => a.cambiarInicioCiclo('2026-11-01'), 'POST', '/api/v1/reports/admin/ciclos/inicio'],
    ['registrar salida', a => a.registrarSalida({} as never), 'POST', '/api/v1/reports/admin/salidas'],
    ['registrar varias salidas', a => a.registrarSalidas([]), 'POST', '/api/v1/reports/admin/salidas/varias'],
    ['leer whatsapp destino', a => a.whatsappDestino(), 'GET', '/api/v1/reports/admin/whatsapp-destino'],
    ['cambiar whatsapp destino', a => a.setWhatsappDestino('56912345678'), 'PUT', '/api/v1/reports/admin/whatsapp-destino'],
    ['estado de territorio', a => a.estadoTerritorio(5), 'GET', '/api/v1/reports/admin/estado/5'],
    ['corregir territorio', a => a.corregir({} as never), 'POST', '/api/v1/reports/admin/correccion'],
    ['leer salida', a => a.salida(5), 'GET', '/api/v1/reports/admin/5/salida'],
    ['corregir salida', a => a.corregirSalida(5, {} as never), 'POST', '/api/v1/reports/admin/5/corregir'],
    ['listar encargados', a => a.listarEncargados(), 'GET', '/api/v1/encargados/admin'],
    ['crear encargado', a => a.crearEncargado({} as never), 'POST', '/api/v1/encargados/admin'],
    ['actualizar encargado', a => a.actualizarEncargado(3, {} as never), 'PUT', '/api/v1/encargados/admin/3'],
    ['eliminar encargado', a => a.eliminarEncargado(3), 'DELETE', '/api/v1/encargados/admin/3'],
    ['generar pin', a => a.generarPin(3), 'POST', '/api/v1/encargados/admin/3/pin'],
    ['quitar pin', a => a.quitarPin(3), 'DELETE', '/api/v1/encargados/admin/3/pin'],
    ['desbloquear encargado', a => a.desbloquearEncargado(3), 'POST', '/api/v1/encargados/admin/3/desbloquear'],
    ['fusionar encargados', a => a.fusionarEncargados(1, 2), 'POST', '/api/v1/encargados/admin/1/fusionar/2'],
    ['importar encargados', a => a.importarEncargados([], true), 'POST', '/api/v1/encargados/admin/importar'],
    ['leer configuración', a => a.configuracion(), 'GET', '/api/v1/encargados/admin/config'],
    ['abrir/cerrar registro', a => a.setRegistroAbierto(true), 'PUT', '/api/v1/encargados/admin/config'],
    ['entrar a sistema', a => a.entrarSistema('clave'), 'POST', '/api/v1/sistema/entrar'],
    ['estado del sistema', a => a.estadoSistema(), 'GET', '/api/v1/sistema/estado'],
    ['salir de sistema', a => a.salirSistema(), 'POST', '/api/v1/sistema/salir'],
  ];

  for (const [nombre, invocar, metodo, url] of casos) {
    it(`${nombre} → ${metodo} ${url}`, async () => {
      const promesa = invocar(api);
      const req = http.expectOne(r => r.url === url && r.method === metodo);
      expect(req.request.headers.get('ngsw-bypass')).toBe('true');
      req.flush({});
      await promesa;
    });
  }

  it('estadoTerritorio devuelve null cuando el backend no manda cuerpo', async () => {
    const promesa = api.estadoTerritorio(5);
    http.expectOne('/api/v1/reports/admin/estado/5').flush(null);
    await expect(promesa).resolves.toBeNull();
  });

  it('eliminar varias manzanas manda los ids juntos', async () => {
    const promesa = api.eliminarManzanas([4, 9]);
    const req = http.expectOne(r => r.url === '/api/v1/territories/admin/manzanas');
    expect(req.request.params.get('ids')).toBe('4,9');
    req.flush({ eliminadas: 2 });
    await promesa;
  });

  it('mensajeDeError explica un 403 sin cuerpo útil', () => {
    const sinPermiso = new HttpErrorResponse({ status: 403, error: 'texto plano' });
    expect(mensajeDeError(sinPermiso)).toContain('no tiene permiso');
  });
});
