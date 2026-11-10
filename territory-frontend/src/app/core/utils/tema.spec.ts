import { afterEach, describe, expect, it } from 'vitest';
import { aplicarTemaGuardado, CLAVE_TEMA } from './tema';

describe('aplicarTemaGuardado', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sin nada guardado deja el tema claro', () => {
    aplicarTemaGuardado();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('respeta el tema oscuro que el hermano eligió en el mapa', () => {
    localStorage.setItem(CLAVE_TEMA, 'dark');
    aplicarTemaGuardado();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
