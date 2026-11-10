import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature } from '../../admin.models';
import { CorreccionMap } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { fmtFecha } from '../../utils/formato';
import { documentoParaImprimir, leerTerritorios, tarjetaDe, type Tarjeta } from '../../utils/tarjeta';

/**
 * Tarjetas de territorio para imprimir: una hoja por territorio con su mapa
 * y la lista de manzanas (lo ya predicado en esta vuelta va marcado), para
 * los hermanos que trabajan en papel.
 */
@Component({
  selector: 'app-tarjetas',
  imports: [CorreccionMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tarjetas.html',
  styleUrl: './tarjetas.css',
})
export class TarjetasPage {
  private readonly api = inject(AdminApi);
  protected readonly store = inject(AdminStore);
  private readonly toast = inject(Toast);
  private readonly mapa = viewChild(CorreccionMap);

  protected readonly texto = signal('');
  protected readonly elegidos = computed(() => leerTerritorios(this.texto(), this.store.territorios()));
  protected readonly preparando = signal<{ hecho: number; total: number } | null>(null);

  /** Lo que muestra el mapa mientras se preparan las tarjetas. */
  private readonly preparada = signal<{ manzanas: ManzanaFeature[]; tarjeta: Tarjeta } | null>(null);
  /** Vista previa: la tarjeta que se está preparando o, si no, el primer territorio elegido. */
  protected readonly enMapa = computed(() => {
    const p = this.preparada();
    if (p) return p;
    const t = this.elegidos()[0];
    if (t === undefined) return null;
    const manzanas = this.porTerritorio().get(t) ?? [];
    return { manzanas, tarjeta: tarjetaDe(t, manzanas, null, this.store.colores()[t] ?? '#2563eb') };
  });

  private readonly porTerritorio = computed(() => {
    const m = new Map<number, ManzanaFeature[]>();
    for (const f of (this.store.manzanas()?.features ?? []) as ManzanaFeature[]) {
      const t = f.properties.territorio;
      const lista = m.get(t) ?? [];
      lista.push(f);
      m.set(t, lista);
    }
    return m;
  });

  constructor() {
    void this.store.cargarManzanas();
  }

  protected escribir(e: Event): void {
    this.texto.set((e.target as HTMLInputElement).value);
  }

  protected todos(): void {
    const t = this.store.territorios();
    if (t.length) this.texto.set(`${t[0]}-${t[t.length - 1]}`);
  }

  protected async imprimir(): Promise<void> {
    const lista = this.elegidos();
    if (!lista.length || this.preparando()) return;
    this.preparando.set({ hecho: 0, total: lista.length });
    try {
      const tarjetas: Tarjeta[] = [];
      const imagenes = new Map<number, string | null>();
      for (const t of lista) {
        const manzanas = this.porTerritorio().get(t) ?? [];
        const estado = await this.api.estadoTerritorio(t);
        const tarjeta = tarjetaDe(t, manzanas, estado, this.store.colores()[t] ?? '#2563eb');
        this.preparada.set({ manzanas, tarjeta });
        imagenes.set(t, (await this.mapa()?.capturarAlTerminar()) ?? null);
        tarjetas.push(tarjeta);
        this.preparando.set({ hecho: tarjetas.length, total: lista.length });
      }
      this.abrirImpresion(documentoParaImprimir(tarjetas, imagenes, fmtFecha(new Date())));
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    } finally {
      this.preparando.set(null);
      this.preparada.set(null);
    }
  }

  /** Imprime desde un marco oculto (sin ventanas emergentes que el navegador pueda bloquear). */
  private abrirImpresion(html: string): void {
    document.getElementById('marco-tarjetas')?.remove();
    const marco = document.createElement('iframe');
    marco.id = 'marco-tarjetas';
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    marco.onload = () => {
      // Espera a que las imágenes del mapa estén listas antes de imprimir.
      setTimeout(() => marco.contentWindow?.print(), 300);
    };
    marco.srcdoc = html;
    document.body.appendChild(marco);
  }
}
