/** Donde el teléfono recuerda si el hermano eligió el tema oscuro. */
export const CLAVE_TEMA = 'territory_theme';

/**
 * Color de la barra de arriba del teléfono (hora, batería) en cada tema: el
 * mismo fondo de la app, para que no quede una franja de otro color.
 * `index.html` repite estos valores para pintarla antes de que cargue la app.
 */
export const COLOR_BARRA = { claro: '#ffffff', oscuro: '#09090b' } as const;

/**
 * Pone el tema en toda la página y pinta la barra de arriba del teléfono del
 * mismo color. Todo cambio de tema pasa por aquí.
 */
export function ponerTema(oscuro: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? COLOR_BARRA.oscuro : COLOR_BARRA.claro);
}

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
  ponerTema(oscuro);
}
