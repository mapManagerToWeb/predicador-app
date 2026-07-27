export interface UserProfile {
  name: string;
  lastName: string;
  avatar: number;
  telefono?: string;
  encargadoId?: number;
}

export interface Reporte {
  id: number;
  manzanaId: string | null;
  fecha: string;
  encargadoId: number;
  encargadoNombre: string;
  encargadoApellido: string;
  sessionTime: string;
  estado: string;
  territorioNumero: number;
  totalManzanas: number;
  manzanasMarcadas: number;
  tipoSesion: string;
  geometriaParcial: string | null;
  puntosParciales: string | null;
  manzanasIds: string | null;
}

export interface RegistroReporte {
  territorioNumero: number;
  manzanaId: string | null;
  encargadoId: number | null;
  encargadoNombre: string;
  encargadoApellido: string;
  sessionTime: string;
  estado: string;
  totalManzanas: number;
  manzanasMarcadas: number;
  tipoSesion: string;
  geometriaParcial?: string | null;
  puntosParciales?: string | null;
  manzanasIds?: string | null;
}

export interface TerritorioReporteEnvio {
  numero: number;
  finalizado: boolean;
  totalManzanas: number;
  manzanasMarcadas: number;
}

export interface WhatsAppSendRequest {
  encargadoNombre: string;
  encargadoApellido: string;
  fechaRegistro: string;
  predicacion: string;
  territorios: TerritorioReporteEnvio[];
  screenshotBase64: string | null;
  destinationNumber: string | null;
}

export interface WhatsAppSendResponse {
  success: boolean;
  messageId: string | null;
  error: string | null;
}
