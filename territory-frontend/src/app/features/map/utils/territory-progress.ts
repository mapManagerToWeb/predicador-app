export interface TerritoryProgress {
  total: number;
  marcadas: number;
  isComplete: boolean;
}

export function getTerritoryProgress(
  manzanaCount: number,
  marcadasCount: number
): TerritoryProgress {
  const total = manzanaCount;
  const marcadas = marcadasCount;
  const isComplete = total > 0 && marcadas >= total;
  return { total, marcadas, isComplete };
}
