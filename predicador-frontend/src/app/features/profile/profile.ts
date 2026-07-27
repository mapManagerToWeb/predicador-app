import { Component, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Profile } from '../../core/services/profile';
import { EncargadoService } from '../../core/services/encargado';
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
  private router = inject(Router);
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
    if (this.profileService.hasProfile()) {
      void this.router.navigate(['/map']);
    }
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
    } catch {
      const tel = this.telefono().trim();
      this.profileService.save({
        name: this.name(),
        lastName: this.lastName(),
        avatar: this.selectedAvatar(),
        telefono: tel ? normalizePhone(tel) : undefined,
      });
      this.toast.show('Perfil guardado localmente', 3000, 'warning');
    } finally {
      this.loading.set(false);
    }

    void this.router.navigate(['/map']);
  }
}
