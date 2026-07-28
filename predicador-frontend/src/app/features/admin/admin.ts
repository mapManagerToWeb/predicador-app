import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { environment } from '../../../environments/environment';

const COLORES_PREDEFINIDOS = [
  '#DC143C', '#00A86B', '#FF6600', '#8A2BE2', '#E0115F',
  '#00CED1', '#FF1493', '#32CD32', '#FF4500', '#1E90FF',
  '#DA70D6', '#FFD700', '#00FF7F', '#FF00FF', '#4169E1',
  '#FF69B4', '#7B68EE', '#FF8C00', '#00BFFF', '#FF6347',
  '#9370DB', '#3CB371', '#FF1493', '#4682B4', '#FFA500',
  '#2E8B57', '#CD5C5C', '#6A5ACD', '#20B2AA', '#DAA520'
];

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminPage implements OnInit {
  private territorioService = inject(TerritorioService);
  private toastService = inject(Toast);
  private router = inject(Router);
  private http = inject(HttpClient);
  private profileService = inject(Profile);
  private authToken = inject(AuthTokenService);

  isLoggedIn = signal(false);
  username = signal('');
  password = signal('');
  loginError = signal(false);
  logging = signal(false);

  numerosTerritorios = signal<number[]>([]);
  colores = signal<Record<number, string>>({});
  coloresPredefinidos = COLORES_PREDEFINIDOS;
  guardando = signal(false);

  ngOnInit(): void {
    // Prefer a real admin token when present; the legacy `isAdmin` flag remains
    // as a fallback so users mid-rollout are not locked out until they refresh
    // credentials. Both are cleared together on logout.
    if (this.authToken.isAdmin() || localStorage.getItem('isAdmin') === 'true') {
      this.isLoggedIn.set(true);
      void this.cargarDatos();
    }
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
        this.http.post<{ success: boolean; token?: string }>(`${environment.apiUrl}/auth/login`, {
          username: this.username(),
          password: this.password()
        })
      );
      if (response.success) {
        localStorage.setItem('isAdmin', 'true');
        if (response.token) {
          this.authToken.set(response.token, 'admin');
        }
        this.isLoggedIn.set(true);
        void this.cargarDatos();
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
    localStorage.removeItem('isAdmin');
    this.authToken.clear();
    this.profileService.clear();
    this.isLoggedIn.set(false);
    this.username.set('');
    this.password.set('');
    void this.router.navigate(['/login']);
  }

  async cargarDatos(): Promise<void> {
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.numerosTerritorios.set(numeros);

      const coloresMap = await this.territorioService.getColores();
      this.colores.set(coloresMap);
    } catch {
      this.toastService.show('Error al cargar territorios');
    }
  }

  getColor(numero: number): string {
    return this.colores()[numero] || COLORES_PREDEFINIDOS[(numero - 1) % COLORES_PREDEFINIDOS.length];
  }

  async cambiarColor(numero: number, color: string): Promise<void> {
    const nuevosColores = { ...this.colores(), [numero]: color };
    this.colores.set(nuevosColores);

    try {
      await this.territorioService.asignarColor(numero, color);
      this.toastService.show(`Color del territorio ${numero} actualizado`);
    } catch {
      this.toastService.show('Error al guardar color');
    }
  }

  goToMap(): void {
    void this.router.navigate(['/map']);
  }
}
