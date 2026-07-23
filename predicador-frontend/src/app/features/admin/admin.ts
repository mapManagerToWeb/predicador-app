import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';

const COLORES_PREDEFINIDOS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9'
];

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class AdminPage implements OnInit {
  private territorioService = inject(TerritorioService);
  private toastService = inject(Toast);
  private router = inject(Router);

  isLoggedIn = signal(false);
  username = signal('');
  password = signal('');
  loginError = signal(false);

  numerosTerritorios = signal<number[]>([]);
  colores = signal<Record<number, string>>({});
  coloresPredefinidos = COLORES_PREDEFINIDOS;
  guardando = signal(false);

  ngOnInit(): void {
    if (localStorage.getItem('isAdmin') === 'true') {
      this.isLoggedIn.set(true);
      this.cargarDatos();
    }
  }

  login(): void {
    this.loginError.set(false);
    if (this.username() === 'admin' && this.password() === 'INVALID_REDACTED_CREDENTIAL') {
      localStorage.setItem('isAdmin', 'true');
      this.isLoggedIn.set(true);
      this.cargarDatos();
    } else {
      this.loginError.set(true);
    }
  }

  logout(): void {
    localStorage.removeItem('isAdmin');
    this.isLoggedIn.set(false);
    this.username.set('');
    this.password.set('');
  }

  async cargarDatos(): Promise<void> {
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.numerosTerritorios.set(numeros);

      const coloresMap = await this.territorioService.getColores();
      this.colores.set(coloresMap);
    } catch (e) {
      console.error('Error al cargar datos', e);
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
    } catch (e) {
      console.error('Error al guardar color', e);
      this.toastService.show('Error al guardar color');
    }
  }

  goToMap(): void {
    this.router.navigate(['/map']);
  }
}
