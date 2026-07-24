export interface UserProfile {
  name: string;
  lastName: string;
  avatar: number;
  encargadoId?: number;
}

export interface Encargado {
  id: number;
  nombre: string;
  apellido: string;
  avatar: number;
  activo: boolean;
}

export interface Territorio {
  number: number;
  name: string;
  geoJson: string;
  color: string;
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
