import { routes } from './app.routes';
import { MODO_PRACTICA } from './core/map/modo-practica';

describe('rutas de la app', () => {
  it('/practice es pública y enciende el modo práctica', () => {
    const practica = routes.find(r => r.path === 'practice');
    expect(practica).toBeDefined();
    expect(practica?.canActivate).toBeUndefined();
    expect(practica?.providers).toContainEqual({ provide: MODO_PRACTICA, useValue: true });
  });
});
