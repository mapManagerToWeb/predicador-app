import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TOAST_MESSAGES,
  MAX_TILE_WAIT_MS,
  nextParcialId,
} from './map-constants';

describe('map-constants', () => {
  describe('TOAST_MESSAGES.selectManzana', () => {
    it('formats the manzana name into the hint message', () => {
      expect(TOAST_MESSAGES.selectManzana('A')).toBe(
        'Manzana "A" — tocá para colocar puntos'
      );
    });

    it('keeps unicode names intact', () => {
      expect(TOAST_MESSAGES.selectManzana('Ñuñoa Ñ')).toContain('Ñuñoa Ñ');
    });
  });

  describe('nextParcialId', () => {
    it('generates unique ids across calls in the same millisecond', () => {
      const ids = Array.from({ length: 50 }, () => nextParcialId());
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('uses the parcial- prefix', () => {
      expect(nextParcialId()).toMatch(/^parcial-\d+-\d+$/);
    });
  });

  describe('MAX_TILE_WAIT_MS', () => {
    afterEach(() => {
      vi.resetModules();
      vi.unstubAllGlobals();
    });

    async function importWithUserAgent(userAgent: string): Promise<number> {
      vi.resetModules();
      Object.defineProperty(window.navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
      });
      const mod = await import('./map-constants');
      return mod.MAX_TILE_WAIT_MS;
    }

    it('uses 8000ms on iOS Safari (AppleWebKit, no Chrome)', async () => {
      const value = await importWithUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );
      expect(value).toBe(8000);
    });

    it('uses 5000ms on Chrome', async () => {
      const value = await importWithUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      expect(value).toBe(5000);
    });

    it('uses 5000ms when there is no AppleWebKit marker', async () => {
      const value = await importWithUserAgent('TestAgent/1.0');
      expect(value).toBe(5000);
      expect(MAX_TILE_WAIT_MS).toBeGreaterThan(0);
    });
  });
});
