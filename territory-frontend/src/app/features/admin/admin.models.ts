import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/** Propiedades de una manzana en el editor (GET /territories/admin/manzanas). */
export interface ManzanaProps {
  id: number;
  territorio: number;
  nombre: string;
  areaM2: number;
  valida: boolean;
}

export type ManzanaGeometry = Polygon | MultiPolygon;
export type ManzanaFeature = Feature<ManzanaGeometry, ManzanaProps> & { id: number };
export type ManzanasCollection = FeatureCollection<ManzanaGeometry, ManzanaProps>;

export interface ManzanaGuardada {
  id: number;
  territorio: number;
  nombre: string;
  areaM2: number;
  valida: boolean;
  solapaCon: number[];
  /** GeoJSON de la geometría, como texto. */
  geometria: string;
}

export interface ManzanaRequest {
  territorio: number;
  nombre: string;
  /** GeoJSON de la geometría como texto; null al editar = conservar la actual. */
  geometria: string | null;
}

export interface CalidadDatos {
  invalidas: number[];
  solapes: { a: number; b: number; areaM2: number }[];
}

export type EstadoReporte = 'completed' | 'incomplete';

/** Reporte compacto (GET /reports/admin). Las fechas son ISO-8601 UTC. */
export interface ReporteAdmin {
  id: number;
  fecha: string;
  inicioSesion: string | null;
  encargadoId: number | null;
  encargadoNombre: string;
  encargadoApellido: string | null;
  territorio: number;
  estado: EstadoReporte | string;
  tipoSesion: string | null;
  totalManzanas: number | null;
  manzanasMarcadas: number | null;
  manzanasIds: string | null;
  tieneParcial: boolean;
  /** salida (encargado desde el mapa), correccion o reinicio (administrador). Falta en respuestas viejas. */
  origen?: 'salida' | 'correccion' | 'reinicio' | string;
  nota?: string | null;
  /** El administrador lo anuló (ADR 0014): queda en el historial pero no cuenta. */
  anuladoEn?: string | null;
  /** Id del reporte que este corrige. */
  reemplazaA?: number | null;
}

/** Ciclo de territorios (GET /reports/admin/ciclos); `resumen` es JSON al cerrarse. */
export interface CicloAdmin {
  id: number;
  inicio: string;
  fin: string | null;
  nota: string | null;
  resumen: string | null;
}

/** Estado de un territorio al cerrar un ciclo (elemento del JSON `resumen`). */
export interface ResumenTerritorioCiclo {
  territorio: number;
  estado: string | null;
  manzanasMarcadas: number | null;
  totalManzanas: number | null;
  completado: string[];
  primeraSalida: string | null;
  ultimaSalida: string | null;
  encargados: string[];
}

/** Estado actual de un territorio (GET /reports/admin/estado/{n}). */
export interface EstadoTerritorioAdmin {
  territorio: number;
  fecha: string | null;
  estado: string | null;
  origen: string | null;
  encargado: string | null;
  manzanasIds: string | null;
  geometriaParcial: string | null;
  puntosParciales: string | null;
  totalManzanas: number | null;
}

export interface CorreccionRequest {
  territorio: number;
  manzanasIds: string;
  geometriaParcial: string | null;
  puntosParciales: string | null;
  totalManzanas: number;
  manzanasMarcadas: number;
  nota: string | null;
}

export interface EncargadoAdmin {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  avatar: number | null;
  activo: boolean;
  tienePin: boolean;
  pinActualizadoEn: string | null;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  creadoEn: string | null;
  totalReportes: number;
  ultimoReporte: string | null;
}

export interface EncargadoRequest {
  nombre: string;
  apellido: string;
  telefono: string;
  avatar?: number | null;
  activo?: boolean;
}

export interface EnvioWhatsApp {
  id: string;
  fecha: string | null;
  estado: string | null;
  exito: boolean;
  messageId: string | null;
  error: string | null;
  statusCode: number | null;
}

/** El reporte de una salida con lo que había antes en el territorio (GET /reports/admin/{id}/salida). */
export interface SalidaAdmin {
  id: number;
  fecha: string;
  encargado: string;
  territorio: number;
  origen: string;
  estado: string | null;
  manzanasIds: string | null;
  geometriaParcial: string | null;
  puntosParciales: string | null;
  totalManzanas: number | null;
  anuladoEn: string | null;
  /** null: no había reportes antes en el territorio. */
  anterior: { estado: string | null; manzanasIds: string | null; geometriaParcial: string | null; puntosParciales: string | null } | null;
  /** Reportes del territorio que vinieron después (se recalculan al corregir). */
  posteriores: number;
}

export interface CorreccionSalidaRequest {
  anular: boolean;
  manzanasIds: string | null;
  geometriaParcial: string | null;
  puntosParciales: string | null;
  nota: string | null;
}

export interface ResultadoCorreccionSalida {
  anulado: number;
  reemplazo: number | null;
  recalculados: number;
  /** Después hubo una corrección o un cierre de ciclo: desde ahí el estado no se tocó. */
  detenido: boolean;
}
