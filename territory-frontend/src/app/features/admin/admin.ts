import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { TERRITORY_COLORS } from '../map/utils/territory-colors';
import { environment } from '../../../environments/environment';

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
  coloresPredefinidos = TERRITORY_COLORS;
  guardando = signal(false);

  ngOnInit(): void {
    if (this.authToken.isAdmin()) {
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
        this.authToken.set('admin');
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
    this.authToken.logout();
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
    return this.colores()[numero] || TERRITORY_COLORS[(numero - 1) % TERRITORY_COLORS.length];
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
