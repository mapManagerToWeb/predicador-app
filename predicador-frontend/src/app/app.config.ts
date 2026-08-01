import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { provideClientHydration } from '@angular/platform-browser';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { RumService } from './core/services/rum';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Keep map and screenshot libraries lazy until the map route is opened.
    provideRouter(routes),
    // Orden importa: authInterceptor mete el header antes de que errorInterceptor
    // observe la respuesta. Si el token expira y el backend devuelve 401,
    // errorInterceptor lo puede convertir en toast.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideClientHydration(),
    // RUM (Real User Monitoring): captura Core Web Vitals y los envía al
    // backend. Se inicializa una sola vez al arrancar la app; noop en SSR.
    provideAppInitializer(() => {
      inject(RumService).start();
    }),
  ],
};
