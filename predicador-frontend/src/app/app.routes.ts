import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { profileGuard } from './core/guards/profile.guard';

export const routes: Routes = [
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
    path: 'admin',
    loadComponent: () => import('./features/admin/admin').then(m => m.AdminPage)
  },
  { path: '**', redirectTo: 'profile' }
];
