import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthTokenService } from '../../core/services/auth-token';
import { Profile } from '../../core/services/profile';
import { codigoLogin, EncargadoService } from '../../core/services/encargado';
import { Toast } from '../../core/services/toast';
import { normalizePhone } from '../../core/utils/phone';

@Component({
  selector: 'app-profile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.html',
  styleUrls: ['./profile.css', '../auth/auth.css']
})
export class ProfilePage implements OnInit {
  private profileService = inject(Profile);
  private encargadoService = inject(EncargadoService);
  private authToken = inject(AuthTokenService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(Toast);

  name = signal('');
  lastName = signal('');
  telefono = signal('');
  selectedAvatar = signal(0);
  loading = signal(false);

  avatars = [
    { id: 0, emoji: '👨', color: '#3b82f6' },
    { id: 1, emoji: '👩', color: '#8b5cf6' },
    { id: 2, emoji: '🧑', color: '#06b6d4' },
    { id: 3, emoji: '👴', color: '#f59e0b' },
    { id: 4, emoji: '👵', color: '#ef4444' },
    { id: 5, emoji: '🧔', color: '#10b981' },
    { id: 6, emoji: '👱', color: '#f97316' },
    { id: 7, emoji: '👲', color: '#6366f1' },
  ];

  ngOnInit(): void {
    // Solo con sesión: un perfil guardado sin sesión (p. ej. vencida) no debe
    // impedir llegar a este formulario.
    if (this.authToken.hasToken() && this.profileService.hasProfile()) {
      void this.router.navigate(['/map']);
      return;
    }
    // El número que se escribió en el login, para no tener que repetirlo.
    const tel = this.route.snapshot.queryParamMap.get('telefono');
    if (tel) this.telefono.set(tel);
  }

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onLastNameInput(event: Event): void {
    this.lastName.set((event.target as HTMLInputElement).value);
  }

  onTelefonoInput(event: Event): void {
    this.telefono.set((event.target as HTMLInputElement).value);
  }

  selectAvatar(id: number): void {
    this.selectedAvatar.set(id);
  }

  async save(): Promise<void> {
    if (!this.name() || !this.lastName() || !this.telefono() || this.loading()) return;

    this.loading.set(true);
    try {
      const encargado = await this.encargadoService.buscarOCrear(
        this.name(),
        this.lastName(),
        this.telefono()
      );

      const tel = this.telefono().trim();
      this.profileService.save({
        name: this.name(),
        lastName: this.lastName(),
        avatar: this.selectedAvatar(),
        telefono: tel ? normalizePhone(tel) : undefined,
        encargadoId: encargado.id ?? undefined,
      });

      this.toast.show('Perfil creado exitosamente', 2000, 'success');
    } catch (err: unknown) {
      const { code, detail } = codigoLogin(err);
      if (code === 'registro_cerrado' || code === 'ya_registrado') {
        // El servidor rechazó el alta: se queda en el formulario con el motivo.
        this.toast.show(detail ?? 'No se pudo crear el perfil', 6000, 'warning');
      } else {
        // Sin cuenta en el servidor no se puede entrar ni enviar reportes: no
        // se guarda un perfil "local" (dejaba al usuario dando vueltas entre
        // el login y esta pantalla).
        this.toast.show('No se pudo crear el perfil. Revisa tu conexión e intenta de nuevo.', 5000, 'error');
      }
      return;
    } finally {
      this.loading.set(false);
    }

    void this.router.navigate(['/map']);
  }
}
