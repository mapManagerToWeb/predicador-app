export interface UserProfile {
  name: string;
  lastName: string;
  avatar: number;
}

export interface Territorio {
  number: number;
  name: string;
  geoJson: string;
  color: string;
}

export interface Reporte {
  id: number;
  manzanaId: number;
  fecha: string;
  encargadoNombre: string;
  encargadoApellido: string;
  sessionTime: string;
  estado: string;
  territorioNumero: number;
}

export interface RegistroReporte {
  territorioNumero: number;
  manzanaIds: number[];
  encargadoNombre: string;
  encargadoApellido: string;
  sessionTime: string;
  estado: string;
}
