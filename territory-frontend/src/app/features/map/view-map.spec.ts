import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewMapPage } from './view-map';
import { MapEngineService } from './services/map-engine.service';
import { MapTileLayerService } from './services/map-tile-layer.service';
import { MapTerritoryLayerService } from './services/map-territory-layer.service';
import { TerritorioService } from '../../core/services/territorio';
import { Router } from '@angular/router';

describe('ViewMapPage', () => {
  let component: ViewMapPage;
  let fixture: ComponentFixture<ViewMapPage>;
  let engine: {
    initializeMap: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let tiles: {
    initLayers: ReturnType<typeof vi.fn>;
    observeThemeChanges: ReturnType<typeof vi.fn>;
    toggleSatellite: ReturnType<typeof vi.fn>;
    isSatellite: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let territories: {
    loadAllTerritories: ReturnType<typeof vi.fn>;
    updateVisibleTerritories: ReturnType<typeof vi.fn>;
    ensureTerritoryLoaded: ReturnType<typeof vi.fn>;
    getFeatureLayerByTerritorio: ReturnType<typeof vi.fn>;
  };
  let territorioService: {
    getAllGeoJson: ReturnType<typeof vi.fn>;
    getNumerosTerritorios: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    engine = {
      initializeMap: vi.fn(),
      getMap: vi.fn().mockReturnValue(null),
      destroy: vi.fn(),
    };
    tiles = {
      initLayers: vi.fn(),
      observeThemeChanges: vi.fn(),
      toggleSatellite: vi.fn(),
      isSatellite: vi.fn().mockReturnValue(false),
      destroy: vi.fn(),
    };
    territories = {
      loadAllTerritories: vi.fn().mockResolvedValue(undefined),
      updateVisibleTerritories: vi.fn().mockReturnValue([]),
      ensureTerritoryLoaded: vi.fn(),
      getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
    };
    territorioService = {
      getAllGeoJson: vi.fn().mockResolvedValue('{"type":"FeatureCollection","features":[]}'),
      getNumerosTerritorios: vi.fn().mockResolvedValue([1, 2, 3]),
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [ViewMapPage],
      providers: [
        { provide: MapEngineService, useValue: engine },
        { provide: MapTileLayerService, useValue: tiles },
        { provide: MapTerritoryLayerService, useValue: territories },
        { provide: TerritorioService, useValue: territorioService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewMapPage);
    component = fixture.componentInstance;
  });

  it('should create ViewMapPage instance', () => {
    expect(component).toBeTruthy();
    expect(component.isLoading()).toBe(true);
    expect(component.isSatellite()).toBe(false);
  });

  describe('Search & Filtering', () => {
    it('filters territory numbers matching query', () => {
      component.todosLosNumeros.set([1, 2, 12, 23, 30]);
      component.consultaBusqueda.set('2');

      const filtered = component.numerosFiltrados();
      expect(filtered).toEqual([2, 12, 23]);
    });

    it('returns all numbers when search query is empty', () => {
      component.todosLosNumeros.set([1, 2, 3]);
      component.consultaBusqueda.set('');

      expect(component.numerosFiltrados()).toEqual([1, 2, 3]);
    });

    it('handles input events correctly', () => {
      const event = { target: { value: '15' } } as unknown as Event;
      component.onInput(event);

      expect(component.consultaBusqueda()).toBe('15');
      expect(component.mostrarDropdown()).toBe(true);
    });

    it('handles onSeleccion correctly', () => {
      const mockBounds = { isValid: () => true };
      const mockLayer = { getBounds: () => mockBounds };
      const mockMap = { fitBounds: vi.fn() };

      engine.getMap.mockReturnValue(mockMap);
      territories.getFeatureLayerByTerritorio.mockReturnValue({
        territorioPadre: 5,
        color: '#ff0000',
        layer: mockLayer,
      });

      component.onSeleccion(5);

      expect(component.consultaBusqueda()).toBe('5');
      expect(component.mostrarDropdown()).toBe(false);
      expect(territories.ensureTerritoryLoaded).toHaveBeenCalledWith(5);
      expect(mockMap.fitBounds).toHaveBeenCalled();
    });
  });

  describe('Satellite and Theme toggles', () => {
    it('toggleSatellite calls MapTileLayerService and updates state', () => {
      tiles.isSatellite.mockReturnValue(true);

      component.toggleSatellite();

      expect(tiles.toggleSatellite).toHaveBeenCalled();
      expect(component.isSatellite()).toBe(true);
    });

    it('toggleTheme toggles the dark mode signal', () => {
      const initial = component.isDark();
      component.toggleTheme();
      expect(component.isDark()).toBe(!initial);
    });
  });

  describe('Navigation', () => {
    it('goToLogin navigates back to /login', () => {
      component.goToLogin();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Lifecycle destroy', () => {
    it('destroys tile and engine services on ngOnDestroy', () => {
      component.ngOnDestroy();
      expect(tiles.destroy).toHaveBeenCalled();
      expect(engine.destroy).toHaveBeenCalled();
    });
  });
});
