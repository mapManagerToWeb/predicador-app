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
