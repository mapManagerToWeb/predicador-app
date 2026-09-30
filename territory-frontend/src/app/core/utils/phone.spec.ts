import { describe, it, expect } from 'vitest';
import { esCelularChileno, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('prefixes Chilean 9-digit mobile numbers with 56', () => {
    expect(normalizePhone('912345678')).toBe('+56912345678');
  });

  it('prefixes numbers that already start with 9 regardless of formatting', () => {
    expect(normalizePhone('9 1234 5678')).toBe('+56912345678');
  });

  it('returns digits unchanged when not a 9-digit mobile number', () => {
    expect(normalizePhone('22334455')).toBe('+22334455');
  });

  it('returns digits unchanged for a full-length number', () => {
    expect(normalizePhone('56912345678')).toBe('+56912345678');
  });

  it('strips non-digit characters without re-prefixing full numbers', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('+56912345678');
  });

  it('returns empty string for input with no digits', () => {
    expect(normalizePhone('(abc)')).toBe('');
  });
});

describe('esCelularChileno', () => {
  it('acepta 9 dígitos que empiezan con 9, con o sin +56 y espacios', () => {
    for (const ok of ['912345678', '9 1234 5678', '+56 9 1234 5678', '56912345678', '+56912345678']) {
      expect(esCelularChileno(ok)).toBe(true);
    }
  });

  it('rechaza otros largos, números que no empiezan con 9 y vacíos', () => {
    for (const malo of ['9123456789', '12345678', '812345678', '09 1234 5678', '+54 9 11 1234 5678', '', null, undefined]) {
      expect(esCelularChileno(malo)).toBe(false);
    }
  });
});
