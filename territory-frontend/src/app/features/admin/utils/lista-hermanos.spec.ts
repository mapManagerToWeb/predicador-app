import { leerLista } from './lista-hermanos';

describe('leer una lista de hermanos', () => {
  it('pegada desde Excel (con encabezado y tabulaciones)', () => {
    expect(leerLista('Nombre\tApellido\tTeléfono\nPedro\tSoto Díaz\t9 2222 3333\nAna\tPérez\t+56911111111\n')).toEqual([
      { nombre: 'Pedro', apellido: 'Soto Díaz', telefono: '9 2222 3333' },
      { nombre: 'Ana', apellido: 'Pérez', telefono: '+56911111111' },
    ]);
  });

  it('CSV con punto y coma o coma, y el teléfono en cualquier columna', () => {
    expect(leerLista('Luis;Rojas;922223333\n933334444, María José Fuentes')).toEqual([
      { nombre: 'Luis', apellido: 'Rojas', telefono: '922223333' },
      { nombre: 'María', apellido: 'José Fuentes', telefono: '933334444' },
    ]);
  });

  it('escrita a mano, con el teléfono al final', () => {
    expect(leerLista('  Pedro Soto 9 1234 5678  \n\nJuan Pérez +56 9 8765-4321')).toEqual([
      { nombre: 'Pedro', apellido: 'Soto', telefono: '9 1234 5678' },
      { nombre: 'Juan', apellido: 'Pérez', telefono: '+56 9 8765-4321' },
    ]);
  });

  it('con tres columnas, un teléfono mal escrito queda como teléfono (no pegado al apellido)', () => {
    expect(leerLista('Luis\tRojas\t12345')).toEqual([{ nombre: 'Luis', apellido: 'Rojas', telefono: '12345' }]);
  });

  it('sin teléfono reconocible deja el teléfono vacío (el servidor lo explica)', () => {
    expect(leerLista('Carla Mora 123')).toEqual([{ nombre: 'Carla', apellido: 'Mora 123', telefono: '' }]);
    expect(leerLista('')).toEqual([]);
  });
});
