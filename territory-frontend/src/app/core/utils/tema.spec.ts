import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aplicarTemaGuardado, CLAVE_TEMA, COLOR_BARRA, ponerTema } from './tema';

function barra(): string | null | undefined {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
}

describe('tema', () => {
  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', COLOR_BARRA.claro);
    document.head.appendChild(meta);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('sin nada guardado deja el tema claro', () => {
    aplicarTemaGuardado();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(barra()).toBe(COLOR_BARRA.claro);
  });

  it('respeta el tema oscuro que el hermano eligió en el mapa', () => {
    localStorage.setItem(CLAVE_TEMA, 'dark');
    aplicarTemaGuardado();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(barra()).toBe(COLOR_BARRA.oscuro);
  });

  it('la barra de arriba del teléfono cambia de color con el tema', () => {
    ponerTema(true);
    expect(barra()).toBe(COLOR_BARRA.oscuro);
    ponerTema(false);
    expect(barra()).toBe(COLOR_BARRA.claro);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sin la etiqueta de la barra igual cambia el tema', () => {
    document.querySelector('meta[name="theme-color"]')?.remove();
    expect(() => ponerTema(true)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
