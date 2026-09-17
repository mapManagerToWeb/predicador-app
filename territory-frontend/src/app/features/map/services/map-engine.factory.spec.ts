import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isWebGL2Available, shouldUseMapLibre } from './map-engine.factory';
import type { MapEngineChoice } from './map-state.service';

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

  it('returns false when document is undefined (SSR)', () => {
    // Simulate SSR by temporarily removing document
    const originalDocument = globalThis.document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document;
    try {
      expect(isWebGL2Available()).toBe(false);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('returns false when getContext throws', () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const canvas = originalCreateElement(tag);
      if (tag === 'canvas') {
        const originalGetContext = canvas.getContext.bind(canvas);
        vi.spyOn(canvas, 'getContext').mockImplementation((ctxId: string) => {
          if (ctxId === 'webgl2') {
            throw new Error('WebGL2 not supported');
          }
          return originalGetContext(ctxId);
        });
      }
      return canvas;
    });

    expect(isWebGL2Available()).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('shouldUseMapLibre (parity checklist — T29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapEngine: "leaflet"', () => {
    it('always returns false (forces Leaflet engine)', () => {
      expect(shouldUseMapLibre('leaflet')).toBe(false);
    });
  });

  describe('mapEngine: "maplibre"', () => {
    it('always returns true (forces MapLibre engine)', () => {
      expect(shouldUseMapLibre('maplibre')).toBe(true);
    });
  });

  describe('mapEngine: "auto"', () => {
    it('returns false when WebGL2 is not available (jsdom)', () => {
      // jsdom has no WebGL2, so auto should resolve to Leaflet
      expect(shouldUseMapLibre('auto')).toBe(false);
    });

    it('returns true when WebGL2 is available', () => {
      // Mock isWebGL2Available by temporarily replacing getContext
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const canvas = originalCreateElement(tag);
        if (tag === 'canvas') {
          vi.spyOn(canvas, 'getContext').mockImplementation((ctxId: string) => {
            if (ctxId === 'webgl2') {
              return {} as unknown as WebGL2RenderingContext;
            }
            return null;
          });
        }
        return canvas;
      });

      expect(shouldUseMapLibre('auto')).toBe(true);
      vi.restoreAllMocks();
    });
  });

  describe('type safety', () => {
    it('accepts all valid MapEngineChoice values', () => {
      const validChoices: MapEngineChoice[] = ['leaflet', 'maplibre', 'auto'];
      for (const choice of validChoices) {
        const result = shouldUseMapLibre(choice);
        expect(typeof result).toBe('boolean');
      }
    });
  });
});

describe('createMaplibreEngine (parity checklist — T29)', () => {
  it('is a function', async () => {
    const { createMaplibreEngine } = await import('./map-engine.factory');
    expect(typeof createMaplibreEngine).toBe('function');
  });

  it('uses dynamic import for maplibre-engine.service', async () => {
    const { createMaplibreEngine } = await import('./map-engine.factory');
    const fnStr = createMaplibreEngine.toString();
    // Vite's SSR transform replaces `import()` with `__vite_ssr_dynamic_import__`
    const hasDynamicImport =
      fnStr.includes('import(') ||
      fnStr.includes('__vite_ssr_dynamic_import__');
    expect(hasDynamicImport).toBe(true);
    expect(fnStr).toContain('maplibre-engine.service');
  });

  it('throws when not on browser platform', async () => {
    // Mock isPlatformBrowser to return false
    vi.doMock('@angular/common', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@angular/common')>();
      return {
        ...actual,
        isPlatformBrowser: () => false,
      };
    });

    const { createMaplibreEngine } = await import('./map-engine.factory');

    await expect(createMaplibreEngine({})).rejects.toThrow(
      'MapLibre engine requires a browser platform',
    );

    vi.doUnmock('@angular/common');
  });
});
