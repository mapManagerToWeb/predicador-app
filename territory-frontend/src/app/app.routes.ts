import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { profileGuard } from './core/guards/profile.guard';
import { MODO_PRACTICA } from './core/map/modo-practica';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then(m => m.LoginPage)
  },
  {
    // Visor público: sin sesión y de solo lectura.
    path: 'visor',
    loadComponent: () => import('./features/visor/visor').then(m => m.VisorPage)
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile').then(m => m.ProfilePage)
  },
  {
    path: 'map',
    loadComponent: () => import('./features/map/map').then(m => m.MapPage),
    canActivate: [profileGuard]
  },
  {
    // Modo práctica: el mismo mapa de /map para probar sin cuenta y sin tocar
    // la app real. Lo marcado vive solo en el teléfono (se borra a los 7 días).
    path: 'practice',
    loadComponent: () => import('./features/map/map').then(m => m.MapPage),
    providers: [{ provide: MODO_PRACTICA, useValue: true }]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin').then(m => m.AdminPage),
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
    canActivate: [adminGuard]
  },
  { path: '**', redirectTo: 'login' }
];
