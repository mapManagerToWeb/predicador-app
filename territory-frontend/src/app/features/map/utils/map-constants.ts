export const DEDUP_THRESHOLD_PX = 2;
export const MAX_PUNTOS_PARCIAL = 6;
export const LABEL_MIN_ZOOM = 14;
export const MAX_TILE_WAIT_MS = typeof navigator !== 'undefined' &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/(Chrome|CriOS)/.test(navigator.userAgent)
    ? 8000   // iOS Safari necesita más tiempo para tiles ArcGIS
    : 5000;

export const MAP_DEFAULTS = {
  initialView: { lat: -37.4779, lng: -73.345 },
  initialZoom: 15,
  maxZoom: 18,
  boundsPadding: [30, 30] as [number, number],
  capturePadding: [50, 50] as [number, number],
  mapBoundsPadFactor: 0.15,
  labelMinZoom: LABEL_MIN_ZOOM,
  maxTileWaitMs: MAX_TILE_WAIT_MS,
} as const;


export const STYLE_DEFAULTS = {
  polygon: {
    weight: 4,
    smoothFactor: 1,
    opacity: 1,
    fillOpacity: 0.05,
  },
  markedPolygon: {
    weight: 4,
    opacity: 1,
    fillOpacity: 0.95,
  },
  partialPolygon: {
    weight: 4,
    fillOpacity: 0.75,
    dashArray: '8, 8',
  },
  partialPolygonComplete: {
    weight: 4,
    fillOpacity: 0.85,
  },
  selectedManzana: {
    weight: 4,
    color: '#facc15',
    fillColor: '#facc15',
    fillOpacity: 0.15,
  },
  hiddenPolygon: {
    opacity: 0,
    fillOpacity: 0,
    stroke: false,
    weight: 0,
  },
  label: {
    className: 'territory-label',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  },
  partialPoint: {
    className: 'partial-point',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  },
} as const;

export const TILE_LAYERS = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

export const ATTRIBUTIONS = {
  light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: '&copy; Esri, Maxar, Earthstar Geographics',
} as const;

export const TOAST_MESSAGES = {
  loadError: 'Error al cargar los territorios',
  restoreError: 'Error al restaurar el marcado anterior',
  noProfile: 'No hay perfil configurado',
  noMarked: 'No hay manzanas marcadas',
  noTerritories: 'No hay territorios marcados',
  noSendableTerritories: 'No hay territorios para enviar',
  saving: 'Guardando reportes...',
  saveSuccess: 'Reportes guardados exitosamente',
  saveError: 'Error al guardar los reportes',
  reportingUnavailable:
    'El servicio de reportes no está disponible — tus marcas se conservaron, reintentá más tarde',
  sendSuccessTitle: 'Territorio actualizado ',
  sendSuccessSubtitle: 'Reporte enviado a WhatsApp',
  sendError: 'Error enviando WhatsApp',
  sendRollbackError: 'El reporte no se guardó porque falló el envío por WhatsApp',
  processError: 'Error al procesar el reporte',
  maxPoints: `Máximo ${MAX_PUNTOS_PARCIAL} puntos`,
  minPoints: 'Necesitás al menos 2 puntos',
  partialMarked: 'Zona parcial marcada — tocá para eliminar',
  partialDeleted: 'Zona parcial eliminada',
  noNearbyManzana: 'No se encontró una manzana cerca',
  selectManzana: (nombre: string) => `Manzana "${nombre}" — tocá para colocar puntos`,
  partialMode: 'Tocá en cualquier parte del mapa',
  completeMode: 'Tocá una manzana para marcarla',
  territoryLock: 'No se puede cambiar de territorio mientras se marca',
  locationDenied: 'Permiso de ubicación denegado — activalo en los ajustes del navegador',
  locationUnavailable: 'No se pudo obtener tu ubicación',
  locationUnsupported: 'Tu navegador no permite usar la ubicación aquí',
  locationLowAccuracy: 'Ubicación con baja precisión — acercate a un lugar abierto',
} as const;

/** Opciones del seguimiento de ubicación (Geolocation API nativa). */
export const LOCATION_DEFAULTS = {
  enableHighAccuracy: true,
  timeoutMs: 15000,
  maximumAgeMs: 10000,
  /** Por encima de este radio (m) se avisa una sola vez de baja precisión. */
  lowAccuracyMeters: 200,
  /** Recentra solo si la posición sale del viewport contraído este factor. */
  recenterPadFactor: 0.05,
} as const;

let parcialSeq = 0;

/**
 * Genera un id único y monotónico para una zona parcial. Evita colisiones de
 * `Date.now()` cuando dos parciales se crean en el mismo milisegundo.
 */
export function nextParcialId(): string {
  return `parcial-${Date.now()}-${parcialSeq++}`;
}
