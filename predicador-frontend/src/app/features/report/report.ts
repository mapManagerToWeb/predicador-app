import { Component, signal, inject } from '@angular/core';
import { Profile } from '../../core/services/profile';
import { TerritorioService } from '../../core/services/territorio';

@Component({
  selector: 'app-report',
  templateUrl: './report.html',
  styleUrl: './report.css'
})
export class ReportPage {
  private profileService = inject(Profile);
  private territorioService = inject(TerritorioService);

  horario = signal<string>(this.getHorarioPorDefecto());

  private getHorarioPorDefecto(): string {
    return new Date().getHours() < 12 ? 'morning' : 'afternoon';
  }

  get perfil() {
    return this.profileService.currentUser();
  }
}
