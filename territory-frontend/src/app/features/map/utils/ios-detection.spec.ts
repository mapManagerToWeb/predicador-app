import { describe, it, expect, vi, afterEach } from 'vitest';
import { isIOS } from './ios-detection';

describe('isIOS', () => {
  let origOntouchend: unknown;

  beforeEach(() => {
    origOntouchend = (globalThis as Record<string, unknown>)['ontouchend'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (origOntouchend === undefined) {
      delete (globalThis as Record<string, unknown>)['ontouchend'];
    } else {
      (globalThis as Record<string, unknown>)['ontouchend'] = origOntouchend;
    }
  });

  it('returns false in Node (no navigator)', () => {
    expect(isIOS()).toBe(false);
  });

  it('returns true for iPhone user agent', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(isIOS()).toBe(true);
  });

  it('returns true for iPad user agent', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(isIOS()).toBe(true);
  });

  it('returns false for Chrome on macOS', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    delete (globalThis as Record<string, unknown>)['ontouchend'];
    expect(isIOS()).toBe(false);
  });

  it('returns false for Chrome on Android', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    expect(isIOS()).toBe(false);
  });
});
