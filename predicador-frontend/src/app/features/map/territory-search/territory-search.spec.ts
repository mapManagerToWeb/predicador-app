import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TerritorySearch } from './territory-search';
import { environment } from '../../../../environments/environment';

describe('TerritorySearch', () => {
  let component: TerritorySearch;
  let fixture: ComponentFixture<TerritorySearch>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerritorySearch],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(TerritorySearch);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load territory numbers', async () => {
      const promise = component.ngOnInit();

      const req = httpMock.expectOne(`${environment.apiUrl}/territories`);
      req.flush([1, 2, 3, 4, 5]);
      await promise;

      expect(component.todosLosNumeros()).toEqual([1, 2, 3, 4, 5]);
      expect(component.cargando()).toBeFalsy();
    });

    it('should set loading to false on error', async () => {
      const promise = component.ngOnInit();

      const req = httpMock.expectOne(`${environment.apiUrl}/territories`);
      req.error(new ProgressEvent('error'));
      await promise;

      expect(component.cargando()).toBeFalsy();
    });
  });

  describe('numerosFiltrados', () => {
    it('should return all numbers when no search', () => {
      component.todosLosNumeros.set([1, 2, 3, 10, 11]);
      component.consultaBusqueda.set('');

      expect(component.numerosFiltrados()).toEqual([1, 2, 3, 10, 11]);
    });

    it('should filter by search query', () => {
      component.todosLosNumeros.set([1, 2, 3, 10, 11]);
      component.consultaBusqueda.set('1');

      expect(component.numerosFiltrados()).toEqual([1, 10, 11]);
    });

    it('should return empty for no match', () => {
      component.todosLosNumeros.set([1, 2, 3]);
      component.consultaBusqueda.set('99');

      expect(component.numerosFiltrados()).toEqual([]);
    });
  });

  describe('onInput', () => {
    it('should update search query and show dropdown', () => {
      const event = { target: { value: '5' } } as unknown as Event;

      component.onInput(event);

      expect(component.consultaBusqueda()).toBe('5');
      expect(component.mostrarDropdown()).toBeTruthy();
    });

    it('should hide dropdown when input is empty', () => {
      const event = { target: { value: '' } } as unknown as Event;

      component.onInput(event);

      expect(component.mostrarDropdown()).toBeFalsy();
    });
  });

  describe('onSeleccion', () => {
    it('should set search query and emit event', () => {
      const emitSpy = vi.spyOn(component.territorySelected, 'emit');

      component.onSeleccion(5);

      expect(component.consultaBusqueda()).toBe('5');
      expect(component.mostrarDropdown()).toBeFalsy();
      expect(emitSpy).toHaveBeenCalledWith([5]);
    });
  });

  describe('onFocus', () => {
    it('should show dropdown if there is a search query', () => {
      component.consultaBusqueda.set('1');
      component.onFocus();

      expect(component.mostrarDropdown()).toBeTruthy();
    });

    it('should not show dropdown if search query is empty', () => {
      component.consultaBusqueda.set('');
      component.onFocus();

      expect(component.mostrarDropdown()).toBeFalsy();
    });
  });

  describe('onBlur', () => {
    it('should hide dropdown after delay', fakeAsync(() => {
      component.mostrarDropdown.set(true);
      component.onBlur();

      tick(300);

      expect(component.mostrarDropdown()).toBeFalsy();
    }));
  });
});
