import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ActualizacionApp } from './core/services/actualizacion';
import { Mantenimiento } from './core/services/mantenimiento';
import { Toast } from './core/services/toast';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected toastService = inject(Toast);
  protected actualizacion = inject(ActualizacionApp);
  protected mantenimiento = inject(Mantenimiento);
  private readonly router = inject(Router);

  /** En el panel no se tapa nada con la pantalla de mantenimiento: desde ahí se actualiza. */
  protected enPanel(): boolean {
    return this.router.url.startsWith('/admin');
  }
}
