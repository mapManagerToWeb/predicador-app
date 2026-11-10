import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ActualizacionApp } from './core/services/actualizacion';
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
}
