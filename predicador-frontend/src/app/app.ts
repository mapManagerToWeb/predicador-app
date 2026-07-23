import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './core/services/toast';
import { inject } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected toastService = inject(Toast);
}
