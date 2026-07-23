import { Component, signal, inject } from '@angular/core';
import html2canvas from 'html2canvas';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { TerritorioService } from '../../core/services/territorio';

interface TerritorioReporte {
  numero: number;
  manzanasMarcadas: number;
  bloques: string[];
  estado: 'completed' | 'incomplete';
}

@Component({
  selector: 'app-report',
  templateUrl: './report.html',
  styleUrl: './report.css'
})
export class ReportPage {
  private profileService = inject(Profile);
  private toastService = inject(Toast);
  private territorioService = inject(TerritorioService);

  horario = signal<string>(this.getHorarioPorDefecto());
  mostrarCaptura = signal(false);
  capturaUrl = signal<string | null>(null);
  procesando = signal(false);

  territoriosEnSesion = signal<TerritorioReporte[]>([]);

  private getHorarioPorDefecto(): string {
    return new Date().getHours() < 12 ? 'morning' : 'afternoon';
  }

  get perfil() {
    return this.profileService.currentUser();
  }

  private formatearFecha(): string {
    const d = new Date();
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}-${mes}-${anio}`;
  }

  enviarReporte(territorioNumero: number, manzanasMarcadas: number, bloques: string[], manzanaIds: number[]): void {
    const territorios = [...this.territoriosEnSesion()];
    const existente = territorios.find(t => t.numero === territorioNumero);

    if (existente) {
      existente.manzanasMarcadas = manzanasMarcadas;
      existente.bloques = bloques;
      existente.estado = manzanasMarcadas > 0 ? 'completed' : 'incomplete';
    } else {
      territorios.push({
        numero: territorioNumero,
        manzanasMarcadas,
        bloques,
        estado: manzanasMarcadas > 0 ? 'completed' : 'incomplete'
      });
    }

    this.territoriosEnSesion.set(territorios);
    this.enviarPorWhatsApp();
  }

  private construirMensaje(): string {
    const perfil = this.perfil;
    const horario = this.horario() === 'morning' ? 'Mañana' : 'Tarde';
    const lineas = [
      `Fecha: ${this.formatearFecha()}`,
      `Encargado: ${perfil?.name} ${perfil?.lastName}`,
      `Horario: ${horario}`,
      ''
    ];

    const territorios = this.territoriosEnSesion();
    if (territorios.length === 0) {
      lineas.push('Sin territorios registrados.');
      return lineas.join('\n');
    }

    for (const t of territorios) {
      if (t.estado === 'completed') {
        lineas.push(`Territorio ${t.numero} *Terminado*`);
      } else {
        lineas.push(`Territorio ${t.numero}`);
        lineas.push('Se predico lo marcado.');
      }
    }

    return lineas.join('\n');
  }

  async enviarPorWhatsApp(): Promise<void> {
    const mensaje = this.construirMensaje();

    this.procesando.set(true);
    try {
      const mapEl = document.getElementById('map');
      if (mapEl) {
        const canvas = await html2canvas(mapEl, {
          useCORS: true,
          allowTaint: true,
          scale: 2
        });

        canvas.toBlob(async (blob) => {
          if (blob) {
            this.capturaUrl.set(canvas.toDataURL('image/png'));
            this.mostrarCaptura.set(true);

            if (navigator.share && navigator.canShare) {
              const archivo = new File([blob], 'territorio.png', { type: 'image/png' });
              const datos = { text: mensaje, files: [archivo] };
              if (navigator.canShare(datos)) {
                try {
                  await navigator.share(datos);
                  this.toastService.show('Compartido exitosamente');
                  this.mostrarCaptura.set(false);
                  return;
                } catch (e) {
                  if ((e as Error).name !== 'AbortError') {
                    console.error('Error al compartir', e);
                  }
                }
              }
            }

            this.toastService.show('Descargá la imagen y copiá el texto para WhatsApp', 5000);
          }
        }, 'image/png');
      }
    } catch (e) {
      console.error('Error al capturar', e);
      this.toastService.show('Error al capturar el mapa');
    } finally {
      this.procesando.set(false);
    }
  }

  descargarCaptura(): void {
    const url = this.capturaUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'territorio-marcado.png';
    a.click();
  }

  async copiarCaptura(): Promise<void> {
    const url = this.capturaUrl();
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      this.toastService.show('Imagen copiada al portapapeles');
    } catch (e) {
      this.toastService.show('Error al copiar la imagen');
    }
  }

  async copiarMensaje(): Promise<void> {
    const mensaje = this.construirMensaje();
    try {
      await navigator.clipboard.writeText(mensaje);
      this.toastService.show('Texto copiado');
    } catch (e) {
      this.toastService.show('Error al copiar texto');
    }
  }

  abrirWhatsApp(): void {
    const mensaje = this.construirMensaje();
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
  }

  cerrarCaptura(): void {
    this.mostrarCaptura.set(false);
    this.capturaUrl.set(null);
  }
}
