export const TERRITORY_COLORS = [
  '#DC143C', '#00A86B', '#FF6600', '#8A2BE2', '#E0115F',
  '#00CED1', '#FF1493', '#32CD32', '#FF4500', '#1E90FF',
  '#DA70D6', '#FFD700', '#00FF7F', '#FF00FF', '#4169E1',
  '#FF69B4', '#7B68EE', '#FF8C00', '#00BFFF', '#FF6347',
  '#9370DB', '#3CB371', '#FF1493', '#4682B4', '#FFA500',
  '#2E8B57', '#CD5C5C', '#6A5ACD', '#20B2AA', '#DAA520'
];

export const BACKEND_PALETTE = [
  '#DC143C', '#00A86B', '#007FFF', '#FF6600', '#8A2BE2',
  '#E0115F', '#FFBF00', '#00CED1', '#FF1493', '#32CD32',
  '#FF4500', '#1E90FF', '#DA70D6', '#FFD700', '#00FF7F',
  '#FF00FF', '#4169E1', '#FF69B4', '#7B68EE'
];

const DEFAULT_COLOR = '#3b82f6';

export function getColorForTerritorio(territorioNum: number, backendColor: string | null): string {
  if (backendColor && /^#[0-9a-fA-F]{3,8}$/.test(backendColor)) {
    return backendColor;
  }
  const colors = TERRITORY_COLORS;
  const idx = ((territorioNum - 1) % colors.length + colors.length) % colors.length;
  return colors[idx];
}

export function getBackendColorForTerritorio(territorioNum: number, backendColors: Map<number, string>): string {
  if (backendColors.has(territorioNum)) {
    return backendColors.get(territorioNum)!;
  }
  const idx = Array.from(backendColors.keys()).indexOf(territorioNum);
  return idx >= 0 ? BACKEND_PALETTE[idx % BACKEND_PALETTE.length] : DEFAULT_COLOR;
}

export function getTerritoryFillOpacity(isComplete: boolean): number {
  return isComplete ? 0.85 : 0.05;
}

export const DEDUP_THRESHOLD_PX = 8;
export const MAX_PUNTOS_PARCIAL = 6;
export const LABEL_MIN_ZOOM = 14;
export const CAPTURE_DELAY_MS = 400;