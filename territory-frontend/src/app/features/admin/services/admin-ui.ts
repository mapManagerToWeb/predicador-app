import { Injectable, signal } from '@angular/core';

export interface Confirmacion {
  titulo: string;
  mensaje: string;
  accion: string;
  peligro?: boolean;
  /** Si se indica, hay que escribir este texto para habilitar la acción (borrados masivos). */
  escribir?: string;
}

interface Pendiente extends Confirmacion {
  resolver: (ok: boolean) => void;
}

/** Diálogo de confirmación del panel (uno a la vez), renderizado por el shell. */
@Injectable({ providedIn: 'root' })
export class AdminUi {
  readonly confirmacion = signal<Pendiente | null>(null);

  confirmar(opciones: Confirmacion): Promise<boolean> {
    this.confirmacion()?.resolver(false);
    return new Promise(resolver => this.confirmacion.set({ ...opciones, resolver }));
  }

  responder(ok: boolean): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    pendiente?.resolver(ok);
  }
}
