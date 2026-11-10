import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/** La pantalla (ruta de primer nivel) a la que pertenece una navegación. */
function pantalla(raiz: ActivatedRouteSnapshot): string | undefined {
  return raiz.firstChild?.routeConfig?.path;
}

/**
 * El fundido es para cambiar de pantalla (entrada → mapa, mapa → entrada).
 * Moverse dentro de la misma (las secciones del panel) sigue siendo inmediato:
 * ahí un fundido de toda la página en cada clic estorba más de lo que ayuda.
 */
export function soloEntrePantallas(info: Pick<ViewTransitionInfo, 'transition' | 'from' | 'to'>): void {
  if (pantalla(info.from) === pantalla(info.to)) info.transition.skipTransition();
}
