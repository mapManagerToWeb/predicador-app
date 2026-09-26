import { Routes } from '@angular/router';

/** Páginas del panel; el shell (AdminPage) solo las muestra con sesión de administrador. */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'resumen' },
  {
    path: 'resumen',
    title: 'Resumen · Administración',
    loadComponent: () => import('./pages/resumen/resumen').then(m => m.ResumenPage),
  },
  {
    path: 'territorios',
    title: 'Territorios · Administración',
    loadComponent: () => import('./pages/territorios/territorios').then(m => m.TerritoriosPage),
  },
  {
    path: 'encargados',
    title: 'Encargados · Administración',
    loadComponent: () => import('./pages/encargados/encargados').then(m => m.EncargadosPage),
  },
  {
    path: 'reportes',
    title: 'Reportes · Administración',
    loadComponent: () => import('./pages/reportes/reportes').then(m => m.ReportesPage),
  },
  {
    path: 's13',
    title: 'S-13 y ciclos · Administración',
    loadComponent: () => import('./pages/s13/s13').then(m => m.S13Page),
  },
  { path: '**', redirectTo: 'resumen' },
];
