import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { codigoLogin, EncargadoService } from '../../core/services/encargado';
import { Toast } from '../../core/services/toast';
import { normalizePhone } from '../../core/utils/phone';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrls: ['./login.css', './auth.css']
})
export class LoginPage implements OnInit {
  private profileService = inject(Profile);
  private authToken = inject(AuthTokenService);
  private encargadoService = inject(EncargadoService);
  private router = inject(Router);
  private toast = inject(Toast);

  telefono = signal('');
  loading = signal(false);
  /** El encargado tiene PIN asignado por el administrador: se muestra el campo. */
  pinRequerido = signal(false);
  pin = signal('');

  ngOnInit(): void {
    // Tras un refresh (SSR no conoce el rol persistido) la sesión encargado
    // se rehidrata desde localStorage; llevar al usuario directo al mapa en
    // vez de dejarlo en el formulario de login.
    if (this.authToken.hasToken() && this.profileService.hasProfile()) {
      void this.router.navigate(['/map']);
    }
  }

  onTelefonoInput(event: Event): void {
    this.telefono.set((event.target as HTMLInputElement).value);
    // Otro número: puede que no tenga PIN.
    this.pinRequerido.set(false);
    this.pin.set('');
  }

  onPinInput(event: Event): void {
    this.pin.set((event.target as HTMLInputElement).value.replace(/\D/g, ''));
  }

  async login(): Promise<void> {
    const tel = this.telefono().trim();
    if (!tel) return;

    this.loading.set(true);
    try {
      const encargado = await this.encargadoService.loginByPhone(
        normalizePhone(tel),
        this.pinRequerido() ? this.pin() : undefined,
      );

      this.profileService.save({
        name: encargado.nombre,
        lastName: encargado.apellido,
        avatar: encargado.avatar,
        telefono: encargado.telefono ?? normalizePhone(tel),
        encargadoId: encargado.id ?? undefined,
      });

      void this.router.navigate(['/map']);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const { code, detail } = codigoLogin(err);
      if (code === 'pin_requerido') {
        this.pinRequerido.set(true);
        this.toast.show('Ingresá tu PIN', 3000, 'info');
      } else if (code === 'pin_incorrecto') {
        this.pin.set('');
        this.toast.show('PIN incorrecto', 3000, 'error');
      } else if (code === 'pin_bloqueado' || code === 'inactivo') {
        this.toast.show(detail ?? 'No podés ingresar ahora', 6000, 'error');
      } else if (status === 0) {
        this.toast.show('Servidor no disponible. Intentá de nuevo.', 4000, 'error');
      } else if (status === 404) {
        this.toast.show('Usuario no encontrado. Creá tu perfil.', 4000, 'warning');
      } else {
        this.toast.show('Error al iniciar sesión', 3000, 'error');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
