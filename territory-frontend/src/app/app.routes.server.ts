import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'login',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'profile',
    renderMode: RenderMode.Client,
  },
  {
<<<<<<< HEAD
    path: 'map/view',
    renderMode: RenderMode.Client,
  },
  {
=======
>>>>>>> f993952e61d8c718f69929c1211e5322269167d3
    path: 'map',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
