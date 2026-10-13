import { diaElegible, diasElegibles, fechaParaMensaje, isoLocal } from './dia';

describe('día de la predicación', () => {
  const martes = new Date(2026, 9, 13, 23, 30); // martes 13-10-2026, de noche

  it('usa la fecha del teléfono, no la UTC (de noche en Chile, UTC ya es el día siguiente)', () => {
    expect(isoLocal(martes)).toBe('2026-10-13');
  });

  it('hoy, ayer y los días anteriores con su nombre', () => {
    expect(diaElegible(0, martes)).toEqual({ atras: 0, iso: '2026-10-13', corto: 'mar 13', nombre: 'Hoy' });
    expect(diaElegible(1, martes)).toMatchObject({ iso: '2026-10-12', corto: 'lun 12', nombre: 'Ayer' });
    expect(diaElegible(2, martes)).toMatchObject({ iso: '2026-10-11', nombre: 'Dom 11' });
  });

  it('se puede informar hasta 7 días atrás, también cruzando el mes', () => {
    const dias = diasElegibles(new Date(2026, 10, 3, 10));
    expect(dias).toHaveLength(8);
    expect(dias[7].iso).toBe('2026-10-27');
  });

  it('en el mensaje va como día-mes-año', () => {
    expect(fechaParaMensaje('2026-10-12')).toBe('12-10-2026');
  });
});
