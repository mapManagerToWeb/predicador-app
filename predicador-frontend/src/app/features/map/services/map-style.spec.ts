import { describe, it, expect } from 'vitest';
import {
  getBaseTerritoryStyle,
  getMarkedManzanaStyle,
  getHiddenStyle,
  getSelectedManzanaStyle,
  getPartialPolygonStyle,
  getPartialPolygonCompleteStyle,
  getCaptureUnmarkedStyle,
} from './map-style.service';
import { STYLE_DEFAULTS } from '../utils/map-constants';

describe('MapStyleService — pure style functions', () => {
  describe('getBaseTerritoryStyle', () => {
    it('should return low fillOpacity for incomplete territory', () => {
      const style = getBaseTerritoryStyle('#ff0000', false);
      expect(style.fillOpacity).toBe(0.05);
      expect(style.fillColor).toBe('#ff0000');
      expect(style.color).toBe('#ff0000');
      expect(style.opacity).toBe(1);
      expect(style.stroke).toBe(true);
      expect(style.weight).toBe(STYLE_DEFAULTS.polygon.weight);
    });

    it('should return high fillOpacity for complete territory', () => {
      const style = getBaseTerritoryStyle('#00ff00', true);
      expect(style.fillOpacity).toBe(0.85);
      expect(style.fillColor).toBe('#00ff00');
      expect(style.color).toBe('#00ff00');
    });
  });

  describe('getMarkedManzanaStyle', () => {
    it('should use markedPolygon fillOpacity', () => {
      const style = getMarkedManzanaStyle('#123456');
      expect(style.fillColor).toBe('#123456');
      expect(style.color).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.markedPolygon.fillOpacity);
      expect(style.opacity).toBe(1);
      expect(style.stroke).toBe(true);
      expect(style.weight).toBe(STYLE_DEFAULTS.polygon.weight);
    });
  });

  describe('getHiddenStyle', () => {
    it('should return hidden polygon style', () => {
      const style = getHiddenStyle();
      expect(style.opacity).toBe(0);
      expect(style.fillOpacity).toBe(0);
      expect(style.stroke).toBe(false);
      expect(style.weight).toBe(0);
    });
  });

  describe('getSelectedManzanaStyle', () => {
    it('should use selectedManzana config', () => {
      const style = getSelectedManzanaStyle();
      expect(style.fillColor).toBe(STYLE_DEFAULTS.selectedManzana.fillColor);
      expect(style.weight).toBe(STYLE_DEFAULTS.selectedManzana.weight);
      expect(style.color).toBe(STYLE_DEFAULTS.selectedManzana.color);
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.selectedManzana.fillOpacity);
    });
  });

  describe('getPartialPolygonStyle', () => {
    it('should be dashed while drafting', () => {
      const style = getPartialPolygonStyle('#123456', true);
      expect(style.fillColor).toBe('#123456');
      expect(style.color).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.partialPolygon.fillOpacity);
      expect(style.dashArray).toBe(STYLE_DEFAULTS.partialPolygon.dashArray);
    });

    it('should be solid when enough points exist', () => {
      const style = getPartialPolygonStyle('#123456', false);
      expect(style.dashArray).toBeUndefined();
      expect(style.weight).toBe(STYLE_DEFAULTS.partialPolygon.weight);
    });
  });

  describe('getPartialPolygonCompleteStyle', () => {
    it('should clear dashArray and use complete fill', () => {
      const style = getPartialPolygonCompleteStyle('#123456');
      expect(style.fillColor).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.partialPolygonComplete.fillOpacity);
      expect(style.weight).toBe(STYLE_DEFAULTS.partialPolygonComplete.weight);
      expect(style.dashArray).toBeUndefined();
    });
  });

  describe('getCaptureUnmarkedStyle', () => {
    it('should dim unmarked polygons during capture', () => {
      const style = getCaptureUnmarkedStyle('#123456');
      expect(style.color).toBe('#123456');
      expect(style.opacity).toBe(0.6);
      expect(style.fillOpacity).toBe(0.05);
      expect(style.weight).toBe(1.5);
    });
  });
});
