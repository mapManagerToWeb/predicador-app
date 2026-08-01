import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('prefixes Chilean 9-digit mobile numbers with 56', () => {
    expect(normalizePhone('912345678')).toBe('56912345678');
  });

  it('prefixes numbers that already start with 9 regardless of formatting', () => {
    expect(normalizePhone('9 1234 5678')).toBe('56912345678');
  });

  it('returns digits unchanged when not a 9-digit mobile number', () => {
    expect(normalizePhone('22334455')).toBe('22334455');
  });

  it('returns digits unchanged for a full-length number', () => {
    expect(normalizePhone('56912345678')).toBe('56912345678');
  });

  it('strips non-digit characters without re-prefixing full numbers', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('56912345678');
  });

  it('returns empty string for input with no digits', () => {
    expect(normalizePhone('(abc)')).toBe('');
  });
});
