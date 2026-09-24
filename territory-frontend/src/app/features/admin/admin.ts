import { ChangeDetectionStrategy, Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthTokenService } from '../../core/services/auth-token';
import { Profile } from '../../core/services/profile';
import { environment } from '../../../environments/environment';
import { AdminStore } from './services/admin-store';
import { AdminUi } from './services/admin-ui';

const CLAVE_TEMA = 'territory_theme';

interface Seccion {
  ruta: string;
  titulo: string;
  /** Path SVG (24×24, trazo) del ícono. */
  icono: string;
}

/**
 * Shell del panel de administración: login propio y, con sesión de admin,
 * navegación lateral + la página activa. Pensado para escritorio.
 *
 * <p>Usa {@link ViewEncapsulation.None}: su hoja define los componentes
 * visuales compartidos por todas las páginas del panel (tarjetas, tablas,
 * botones, formularios), siempre bajo el prefijo {@code .adm}.</p>
 */
@Component({
  selector: 'app-admin',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminPage implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly profileService = inject(Profile);
  private readonly authToken = inject(AuthTokenService);
  private readonly store = inject(AdminStore);
  protected readonly ui = inject(AdminUi);

  readonly isLoggedIn = this.authToken.isAdmin;
  readonly username = signal('');
  readonly password = signal('');
  readonly loginError = signal(false);
  readonly logging = signal(false);
  readonly oscuro = signal(true);
  readonly textoConfirmacion = signal('');

  readonly secciones: Seccion[] = [
    { ruta: 'resumen', titulo: 'Resumen', icono: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
    { ruta: 'territorios', titulo: 'Territorios', icono: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14' },
    {
      ruta: 'encargados',
      titulo: 'Encargados',
      icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    },
    { ruta: 'reportes', titulo: 'Reportes', icono: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5' },
  ];

  ngOnInit(): void {
    this.aplicarTema(this.temaInicial());
  }

  onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  async login(): Promise<void> {
    this.loginError.set(false);
    this.logging.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${environment.apiUrl}/auth/login`, {
          username: this.username(),
          password: this.password(),
        }),
      );
      if (response.success) {
        this.authToken.set('admin');
        this.password.set('');
      } else {
        this.loginError.set(true);
      }
    } catch {
      this.loginError.set(true);
    } finally {
      this.logging.set(false);
    }
  }

  logout(): void {
    this.authToken.logout();
    this.profileService.clear();
    this.store.limpiar();
    this.username.set('');
    this.password.set('');
    void this.router.navigate(['/admin']);
  }

  goToMap(): void {
    void this.router.navigate(['/map']);
  }

  alternarTema(): void {
    this.aplicarTema(!this.oscuro());
    try {
      localStorage.setItem(CLAVE_TEMA, this.oscuro() ? 'dark' : 'light');
    } catch {
      // Sin almacenamiento (modo privado) el tema vale solo para esta sesión.
    }
  }

  responder(ok: boolean): void {
    this.textoConfirmacion.set('');
    this.ui.responder(ok);
  }

  /** Clic fuera del diálogo = cancelar. */
  cerrarSiFondo(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.responder(false);
  }

  onTextoConfirmacion(event: Event): void {
    this.textoConfirmacion.set((event.target as HTMLInputElement).value);
  }

  /** Preferencia guardada (compartida con el mapa); si no hay, la del sistema. */
  private temaInicial(): boolean {
    try {
      const guardado = localStorage.getItem(CLAVE_TEMA);
      if (guardado) return guardado === 'dark';
    } catch {
      // Ignorado: se usa la preferencia del sistema.
    }
    return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private aplicarTema(oscuro: boolean): void {
    this.oscuro.set(oscuro);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
    }
  }
}
