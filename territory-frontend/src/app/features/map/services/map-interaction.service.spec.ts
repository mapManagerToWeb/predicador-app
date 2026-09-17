import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapInteractionService } from './map-interaction.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';

describe('MapInteractionService', () => {
  let service: MapInteractionService;
  let state: MapStateService;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapInteractionService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: { getMap: vi.fn().mockReturnValue(null) } },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapInteractionService);
    state = TestBed.inject(MapStateService);
  });

  describe('handleMapClick', () => {
    it('returns none — MapLibre uses GPU picking in MapPage', () => {
      expect(service.handleMapClick({ latlng: { lat: 0.5, lng: 0.5 } })).toEqual({ action: 'none' });
    });
  });

  describe('handleMarkerDrag', () => {
    it('returns the current partial points unchanged', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 },
      ]);
      const marker = { getLatLng: () => ({ lat: 0.5, lng: 0 }) };

      const result = service.handleMarkerDrag(marker as never, 0);

      expect(result).toEqual(state.puntosParciales());
    });
  });
});
