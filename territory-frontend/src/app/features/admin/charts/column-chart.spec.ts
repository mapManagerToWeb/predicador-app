import { ticksEje } from './column-chart';

describe('ticksEje', () => {
  it('usa pasos de 1, 2 o 5 por potencia de 10 y cubre el máximo', () => {
    expect(ticksEje(0)).toEqual([0, 1]);
    expect(ticksEje(7)).toEqual([0, 2, 4, 6, 8]);
    expect(ticksEje(53)).toEqual([0, 20, 40, 60]);
    expect(ticksEje(1234).at(-1)).toBeGreaterThanOrEqual(1234);
  });
});
