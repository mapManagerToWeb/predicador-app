import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { isDevMode } from '@angular/core';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Precargamos las cuatro rutas lazy en cuanto el router queda idle. Los
    // chunks son pequeños y esto evita el "flash" al navegar (login → profile
    // → map). Si en el futuro el chunk del mapa crece de forma significativa,
    // migrar a una estrategia por-ruta con `data: { preload: true }`.
    provideRouter(routes, withPreloading(PreloadAllModules)),
    // Orden importa: authInterceptor mete el header antes de que errorInterceptor
    // observe la respuesta. Si el token expira y el backend devuelve 401,
    // errorInterceptor lo puede convertir en toast.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideClientHydration(),
  ],
};
