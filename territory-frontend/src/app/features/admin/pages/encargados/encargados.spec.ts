import type { EncargadoAdmin } from '../../admin.models';
import { claveNombre, claveTelefono, posiblesDuplicados } from './encargados';

function encargado(id: number, nombre: string, apellido: string, telefono: string | null): EncargadoAdmin {
  return {
    id, nombre, apellido, telefono, avatar: 1, activo: true, tienePin: false, pinActualizadoEn: null,
    bloqueadoHasta: null, ultimoAcceso: null, creadoEn: null, totalReportes: 0, ultimoReporte: null,
  };
}

describe('detección de encargados duplicados', () => {
  it('normaliza teléfonos con y sin +56 y nombres con tildes', () => {
    expect(claveTelefono('+56 9 9137 0779')).toBe('991370779');
    expect(claveTelefono('991370779')).toBe('991370779');
    expect(claveNombre({ nombre: 'Matías ', apellido: 'Pérez' })).toBe('matias perez');
  });

  it('marca a los que comparten teléfono o nombre', () => {
    const motivos = posiblesDuplicados([
      encargado(5, 'Bastian', 'Sandoval', '991370779'),
      encargado(16, 'Bastian', 'Sandoval', '56991370779'),
      encargado(3, 'Marco', 'Rojas', '56940282369'),
      encargado(8, 'marco', 'rojas', null),
    ]);
    expect(motivos.has(5)).toBe(true);
    expect(motivos.has(16)).toBe(true);
    expect(motivos.get(8)).toContain('nombre');
    expect(motivos.get(3)).toContain('nombre');
  });

  it('no marca a encargados distintos', () => {
    expect(posiblesDuplicados([encargado(1, 'Ana', 'Uno', '911111111'), encargado(2, 'Eva', 'Dos', null)]).size).toBe(0);
  });
});
