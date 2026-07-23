import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TerritorioService } from './territorio';
import { environment } from '../../../environments/environment';

describe('TerritorioService', () => {
  let service: TerritorioService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TerritorioService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TerritorioService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getNumerosTerritorios', () => {
    it('should GET territory numbers', async () => {
      const mockNumbers = [1, 2, 3, 4, 5];

      const promise = service.getNumerosTerritorios();

      const req = httpMock.expectOne(`${environment.apiUrl}/territories`);
      expect(req.request.method).toBe('GET');
      req.flush(mockNumbers);

      const result = await promise;
      expect(result).toEqual(mockNumbers);
    });
  });

  describe('getTerritorio', () => {
    it('should GET a single territory by number', async () => {
      const mockTerritorio = {
        number: 1,
        name: 'Territorio 1',
        geoJson: '{"type":"FeatureCollection","features":[]}',
        color: '#ff0000'
      };

      const promise = service.getTerritorio(1);

      const req = httpMock.expectOne(`${environment.apiUrl}/territories/1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockTerritorio);

      const result = await promise;
      expect(result).toEqual(mockTerritorio);
      expect(result.number).toBe(1);
    });
  });

  describe('getGeoJsonTerritorio', () => {
    it('should GET GeoJSON as text', async () => {
      const mockGeoJson = '{"type":"FeatureCollection","features":[]}';

      const promise = service.getGeoJsonTerritorio(1);

      const req = httpMock.expectOne(`${environment.apiUrl}/territories/1/geojson`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('text');
      req.flush(mockGeoJson);

      const result = await promise;
      expect(result).toBe(mockGeoJson);
    });
  });

  describe('getAllGeoJson', () => {
    it('should GET all territories GeoJSON as text', async () => {
      const mockGeoJson = '{"type":"FeatureCollection","features":[]}';

      const promise = service.getAllGeoJson();

      const req = httpMock.expectOne(`${environment.apiUrl}/territories/all/geojson`);
      expect(req.request.method).toBe('GET');
      req.flush(mockGeoJson);

      const result = await promise;
      expect(result).toBe(mockGeoJson);
    });
  });

  describe('getColores', () => {
    it('should GET color map', async () => {
      const mockColors: Record<number, string> = { 1: '#ff0000', 2: '#3cb44b' };

      const promise = service.getColores();

      const req = httpMock.expectOne(`${environment.apiUrl}/territories/colors`);
      expect(req.request.method).toBe('GET');
      req.flush(mockColors);

      const result = await promise;
      expect(result).toEqual(mockColors);
    });
  });

  describe('asignarColor', () => {
    it('should PUT color for a territory', async () => {
      const promise = service.asignarColor(1, '#ff0000');

      const req = httpMock.expectOne(`${environment.apiUrl}/territories/1/color`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ color: '#ff0000' });
      req.flush(null);

      await promise;
    });
  });

  describe('crearReportes', () => {
    it('should POST reportes', async () => {
      const mockReportes = [{
        territorioNumero: 1,
        manzanaIds: [1, 2],
        encargadoNombre: 'Daniel',
        encargadoApellido: 'Uribe',
        sessionTime: 'morning',
        estado: 'completed'
      }];

      const mockResponse = [{
        id: 1,
        manzanaId: 1,
        fecha: '2026-07-22T00:00:00Z',
        encargadoNombre: 'Daniel',
        encargadoApellido: 'Uribe',
        sessionTime: 'morning',
        estado: 'completed',
        territorioNumero: 1
      }];

      const promise = service.crearReportes(mockReportes);

      const req = httpMock.expectOne(`${environment.apiUrl}/reports`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockReportes);
      req.flush(mockResponse);

      const result = await promise;
      expect(result.length).toBe(1);
    });
  });

  describe('getReportesHoy', () => {
    it('should GET today reports', async () => {
      const promise = service.getReportesHoy();

      const req = httpMock.expectOne(`${environment.apiUrl}/reports/today`);
      expect(req.request.method).toBe('GET');
      req.flush([]);

      const result = await promise;
      expect(result).toEqual([]);
    });
  });
});
