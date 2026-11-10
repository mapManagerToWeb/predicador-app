import { describe, expect, it, vi } from 'vitest';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { soloEntrePantallas } from './transicion';

function raiz(path?: string): ActivatedRouteSnapshot {
  return { firstChild: path === undefined ? null : { routeConfig: { path } } } as unknown as ActivatedRouteSnapshot;
}

function transicion(): ViewTransition & { skipTransition: ReturnType<typeof vi.fn> } {
  return { skipTransition: vi.fn() } as unknown as ViewTransition & { skipTransition: ReturnType<typeof vi.fn> };
}

describe('soloEntrePantallas', () => {
  it('deja el fundido al pasar de la entrada al mapa', () => {
    const t = transicion();
    soloEntrePantallas({ transition: t, from: raiz('login'), to: raiz('map') });
    expect(t.skipTransition).not.toHaveBeenCalled();
  });

  it('lo salta al moverse dentro del panel', () => {
    const t = transicion();
    soloEntrePantallas({ transition: t, from: raiz('admin'), to: raiz('admin') });
    expect(t.skipTransition).toHaveBeenCalledOnce();
  });

  it('lo salta si ninguna de las dos navegaciones tiene pantalla', () => {
    const t = transicion();
    soloEntrePantallas({ transition: t, from: raiz(), to: raiz() });
    expect(t.skipTransition).toHaveBeenCalledOnce();
  });
});
