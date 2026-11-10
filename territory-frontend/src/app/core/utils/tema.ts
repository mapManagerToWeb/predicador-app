/** Donde el teléfono recuerda si el hermano eligió el tema oscuro. */
export const CLAVE_TEMA = 'territory_theme';

/**
 * Pone el tema guardado en el teléfono; claro si nunca eligió uno. Las
 * pantallas de entrada lo llaman para verse igual que el mapa (antes quedaban
 * en negro aunque el mapa fuera claro).
 */
export function aplicarTemaGuardado(): void {
  if (typeof document === 'undefined') return;
  let oscuro = false;
  try {
    oscuro = localStorage.getItem(CLAVE_TEMA) === 'dark';
  } catch {
    // Sin almacenamiento: tema claro.
  }
  document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
}
