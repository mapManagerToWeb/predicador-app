import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { Instalacion } from '../services/instalacion';
import { Toast } from '../services/toast';

/**
 * Pantallas donde se ofrece instalar: la entrada y el mapa (donde llega el
 * hermano que abre el enlace). No en el registro (está llenando datos), ni en
 * el visor, la práctica o el panel.
 */
const PANTALLAS = ['/login', '/map'];

/**
 * Hoja de abajo «Instala Territorios en tu teléfono». En Android tiene el
 * botón «Instalar»; en iPhone, los pasos con dibujos (Apple no deja poner un
 * botón). Ver `core/services/instalacion.ts`.
 */
@Component({
  selector: 'app-aviso-instalar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aviso-instalar.html',
  styleUrl: './aviso-instalar.css',
})
export class AvisoInstalar {
  protected readonly instalacion = inject(Instalacion);
  private readonly toast = inject(Toast);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  private readonly ruta = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly visible = computed(() => {
    const aviso = this.instalacion.aviso();
    if (!aviso) return null;
    const ruta = this.ruta().split(/[?#]/)[0];
    if (!PANTALLAS.includes(ruta)) return null;
    if (ruta === '/map' && this.instalacion.llegoTarde()) return null;
    return aviso;
  });

  protected async instalar(): Promise<void> {
    const resultado = await this.instalacion.instalar();
    if (resultado === 'instalada') {
      this.toast.show('¡Listo! Busca el ícono «Territorios» en tu pantalla de inicio.', 6000, 'success');
    }
  }

  protected async copiarEnlace(): Promise<void> {
    const enlace = this.doc.location.origin;
    try {
      await this.doc.defaultView?.navigator.clipboard.writeText(enlace);
      this.toast.show('Enlace copiado. Ábrelo en Safari y pégalo arriba.', 6000, 'success');
    } catch {
      this.toast.show(`Abre Safari y escribe: ${enlace}`, 8000, 'info');
    }
  }
}
