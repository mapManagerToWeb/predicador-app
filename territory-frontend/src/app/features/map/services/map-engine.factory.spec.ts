import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isWebGL2Available, shouldUseMapLibre } from './map-engine.factory';

describe('isWebGL2Available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a boolean', () => {
    const result = isWebGL2Available();
    expect(typeof result).toBe('boolean');
  });

  it('returns false when WebGL2 context is not available (jsdom)', () => {
    // jsdom does not support WebGL2
    expect(isWebGL2Available()).toBe(false);
  });
});

describe('shouldUseMapLibre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for "leaflet" choice', () => {
    expect(shouldUseMapLibre('leaflet')).toBe(false);
  });

  it('returns true for "maplibre" choice', () => {
    expect(shouldUseMapLibre('maplibre')).toBe(true);
  });

  it('returns false for "auto" when WebGL2 is not available (jsdom)', () => {
    // jsdom has no WebGL2, so auto should resolve to Leaflet
    expect(shouldUseMapLibre('auto')).toBe(false);
  });
});
