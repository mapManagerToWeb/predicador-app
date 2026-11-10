import { normalizarBusqueda } from './territorios';

describe('buscador del editor de territorios', () => {
  it('«85 C», «85c» y «85.c» buscan la misma manzana', () => {
    expect(normalizarBusqueda('85.c')).toBe('85.c');
    expect(normalizarBusqueda(' 85 C ')).toBe('85.c');
    expect(normalizarBusqueda('85c')).toBe('85.c');
    expect(normalizarBusqueda('85')).toBe('85');
    expect(normalizarBusqueda('')).toBe('');
  });
});
