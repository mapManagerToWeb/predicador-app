import { InjectionToken } from '@angular/core';

/**
 * `true` cuando la página del mapa corre en modo práctica (`/practice`): se
 * marca sobre los territorios reales, pero nada se guarda en la base ni se
 * envía por WhatsApp. Lo marcado vive solo en el teléfono y se borra a los
 * 7 días.
 */
export const MODO_PRACTICA = new InjectionToken<boolean>('MODO_PRACTICA', {
  providedIn: 'root',
  factory: () => false,
});
