import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Toast } from '../../../../core/services/toast';
import { TERRITORY_COLORS } from '../../../map/utils/territory-colors';
import type { CalidadDatos, ManzanaFeature, ManzanaGeometry } from '../../admin.models';
import type { FondoMapa } from '../../../../core/map/base-map';
import { EditorMapa } from '../../map/editor-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { descargar } from '../../utils/csv';
import { aFeature, conManzana, fmtArea, siguienteTerritorio, sinManzanas, sugerirNombre } from '../../utils/manzanas';

/**
 * - `ver`: navegar y seleccionar.
 * - `dibujar`: polígono nuevo; `redibujar`: polígono nuevo que reemplaza la
 *   forma de la manzana seleccionada; `vertices`: mover los vértices de la
 *   manzana seleccionada.
 */
type Modo = 'ver' | 'dibujar' | 'redibujar' | 'vertices';

@Component({
  selector: 'app-territorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './territorios.html',
  styleUrl: './territorios.css',
})
export class TerritoriosPage {
  protected readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private readonly archivo = viewChild<ElementRef<HTMLInputElement>>('archivo');
  private editor: EditorMapa | null = null;

  protected readonly paleta = TERRITORY_COLORS;
  protected readonly cargando = signal(true);
  protected readonly errorMapa = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly modo = signal<Modo>('ver');
  protected readonly dibujoListo = signal(false);
  protected readonly fondo = signal<FondoMapa>('mapa');
  protected readonly busqueda = signal('');
  protected readonly territorio = signal<number | null>(null);
  protected readonly seleccion = signal<Set<number>>(new Set());
  protected readonly calidad = signal<CalidadDatos | null>(null);

  /** Formulario de la manzana (alta o edición). */
  protected readonly formTerritorio = signal<number | null>(null);
  protected readonly formNombre = signal('');
  protected readonly destinoMover = signal<number | null>(null);

  private readonly porId = computed(() => {
    const mapa = new Map<number, ManzanaFeature>();
    for (const f of this.store.manzanas()?.features ?? []) mapa.set(Number(f.id), f as ManzanaFeature);
    return mapa;
  });

  protected readonly listaTerritorios = computed(() => {
    const q = this.busqueda().trim();
    return this.store
      .territorios()
      .filter(t => !q || String(t).startsWith(q))
      .map(t => ({ numero: t, manzanas: this.store.manzanasPorTerritorio().get(t) ?? 0, color: this.color(t) }));
  });

  protected readonly manzanasDelTerritorio = computed(() => {
    const t = this.territorio();
    if (t === null) return [];
    return [...this.porId().values()]
      .filter(f => f.properties.territorio === t)
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es', { numeric: true }));
  });

  /** La única manzana seleccionada (para el formulario de edición). */
  protected readonly manzana = computed(() => {
    const ids = [...this.seleccion()];
    return ids.length === 1 ? (this.porId().get(ids[0]) ?? null) : null;
  });

  protected readonly problemas = computed(() => {
    const c = this.calidad();
    return c ? c.invalidas.length + c.solapes.length : 0;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      void this.iniciar();
    });
    destroyRef.onDestroy(() => this.editor?.destruir());

    effect(() => {
      const coleccion = this.store.manzanas();
      const colores = this.store.colores();
      if (coleccion && this.editor) this.editor.setDatos(coleccion, colores);
    });
    effect(() => {
      const ids = this.seleccion();
      const t = this.territorio();
      this.editor?.setSeleccion(ids, t);
    });
  }

  private async iniciar(): Promise<void> {
    try {
      const [editor] = await Promise.all([
        EditorMapa.crear(this.contenedor().nativeElement, {
          clickManzana: (id, agregar) => this.clickManzana(id, agregar),
          clickVacio: () => this.limpiarSeleccion(),
          dibujoTerminado: () => this.dibujoListo.set(true),
        }),
        this.store.cargarManzanas(),
      ]);
      this.editor = editor;
      const coleccion = this.store.manzanas();
      if (coleccion) {
        editor.setDatos(coleccion, this.store.colores());
        const pedido = Number(this.route.snapshot.queryParamMap.get('t'));
        if (pedido && this.store.manzanasPorTerritorio().has(pedido)) this.elegirTerritorio(pedido);
        else editor.enfocar(coleccion);
      }
      void this.revisarCalidad();
    } catch (e) {
      this.errorMapa.set(mensajeDeError(e, 'No se pudo cargar el editor'));
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Selección ──

  protected elegirTerritorio(t: number | null): void {
    this.cancelarDibujo();
    this.territorio.set(t);
    this.seleccion.set(new Set());
    const coleccion = this.store.manzanas();
    if (coleccion && this.editor) {
      if (t === null) this.editor.enfocar(coleccion);
      else this.editor.enfocar(coleccion, t);
    }
  }

  private clickManzana(id: number, agregar: boolean): void {
    if (this.modo() !== 'ver') return;
    const f = this.porId().get(id);
    if (!f) return;
    if (agregar) {
      const ids = new Set(this.seleccion());
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      this.seleccion.set(ids);
    } else {
      this.seleccionarManzana(f, false);
    }
    if (this.territorio() === null || !agregar) this.territorio.set(f.properties.territorio);
  }

  protected seleccionarManzana(f: ManzanaFeature, enfocar = true): void {
    this.cancelarDibujo();
    this.seleccion.set(new Set([Number(f.id)]));
    this.territorio.set(f.properties.territorio);
    this.formTerritorio.set(f.properties.territorio);
    this.formNombre.set(f.properties.nombre);
    if (enfocar) this.editor?.enfocarManzana(f);
  }

  protected alternarEnSeleccion(id: number, event: Event): void {
    const ids = new Set(this.seleccion());
    if ((event.target as HTMLInputElement).checked) ids.add(id);
    else ids.delete(id);
    this.seleccion.set(ids);
  }

  protected deseleccionar(): void {
    this.seleccion.set(new Set());
  }

  protected limpiarSeleccion(): void {
    if (this.modo() !== 'ver') return;
    this.seleccion.set(new Set());
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    if (this.modo() !== 'ver') this.cancelarDibujo();
    else this.seleccion.set(new Set());
  }

  // ── Dibujo ──

  protected nuevaManzana(): void {
    const t = this.territorio() ?? siguienteTerritorio(this.store.territorios());
    this.seleccion.set(new Set());
    this.formTerritorio.set(t);
    this.formNombre.set(this.nombreSugerido(t));
    this.modo.set('dibujar');
    this.dibujoListo.set(false);
    this.editor?.dibujarNuevo();
  }

  protected editarVertices(): void {
    const f = this.manzana();
    if (!f || !this.editor) return;
    if (!this.editor.editarVertices(f)) {
      this.toast.show('Esta forma no se puede editar por vértices; usá "Redibujar".', 4000, 'warning');
      return;
    }
    this.modo.set('vertices');
    this.dibujoListo.set(true);
  }

  protected redibujar(): void {
    const f = this.manzana();
    if (!f || !this.editor) return;
    this.editor.dibujarNuevo();
    this.editor.ocultar(Number(f.id));
    this.modo.set('redibujar');
    this.dibujoListo.set(false);
  }

  protected cancelarDibujo(): void {
    this.editor?.cancelarDibujo();
    this.modo.set('ver');
    this.dibujoListo.set(false);
  }

  // ── Guardar ──

  protected async guardar(): Promise<void> {
    const territorio = this.formTerritorio();
    const nombre = this.formNombre().trim();
    if (territorio === null || territorio < 0 || !nombre) {
      this.toast.show('Completá el número de territorio y el nombre de la manzana.', 4000, 'warning');
      return;
    }
    const modo = this.modo();
    const geometria = modo === 'ver' ? null : this.editor?.geometriaDibujada();
    if (modo !== 'ver' && !geometria) {
      this.toast.show('Terminá de dibujar el polígono (clic en el primer vértice para cerrarlo).', 4000, 'warning');
      return;
    }
    const existente = this.manzana();
    const nuevoTerritorio = !this.store.manzanasPorTerritorio().has(territorio);
    this.guardando.set(true);
    try {
      const req = { territorio, nombre, geometria: geometria ? JSON.stringify(geometria) : null };
      const guardada =
        modo === 'dibujar' || !existente
          ? await this.api.crearManzana(req)
          : await this.api.actualizarManzana(Number(existente.id), req);
      const feature = aFeature(guardada);
      this.store.manzanas.update(c => (c ? conManzana(c, feature) : c));
      if (nuevoTerritorio) await this.store.recargarColores();
      this.cancelarDibujo();
      this.seleccionarManzana(feature, false);
      this.toast.show(modo === 'dibujar' ? `Manzana ${guardada.nombre} creada` : 'Cambios guardados', 3000, 'success');
      if (guardada.solapaCon.length) {
        const nombres = guardada.solapaCon.map(id => this.porId().get(id)?.properties.nombre ?? `#${id}`);
        this.toast.show(`Ojo: se superpone con ${nombres.join(', ')}`, 6000, 'warning');
      }
      void this.revisarCalidad();
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }

  protected async reparar(): Promise<void> {
    const f = this.manzana();
    if (!f) return;
    try {
      const reparada = aFeature(await this.api.repararManzana(Number(f.id)));
      this.store.manzanas.update(c => (c ? conManzana(c, reparada) : c));
      this.toast.show(reparada.properties.valida ? 'Geometría reparada' : 'No se pudo reparar', 3000,
        reparada.properties.valida ? 'success' : 'warning');
      void this.revisarCalidad();
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  protected async eliminarManzana(): Promise<void> {
    const f = this.manzana();
    if (!f) return;
    const ok = await this.ui.confirmar({
      titulo: `Eliminar la manzana ${f.properties.nombre}`,
      mensaje: 'Se borra del mapa para todos. Los reportes anteriores se conservan.',
      accion: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await this.api.eliminarManzana(Number(f.id));
      this.store.manzanas.update(c => (c ? sinManzanas(c, [Number(f.id)]) : c));
      this.seleccion.set(new Set());
      this.toast.show('Manzana eliminada', 3000, 'success');
      void this.revisarCalidad();
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  protected async moverSeleccion(): Promise<void> {
    const destino = this.destinoMover();
    const ids = [...this.seleccion()];
    if (destino === null || destino < 0 || ids.length === 0) return;
    const nuevo = !this.store.manzanasPorTerritorio().has(destino);
    const ok = await this.ui.confirmar({
      titulo: `Mover ${ids.length} manzana(s) al territorio ${destino}`,
      mensaje: nuevo
        ? `El territorio ${destino} no existe todavía: se va a crear con estas manzanas.`
        : 'Las manzanas conservan su nombre y su forma.',
      accion: 'Mover',
    });
    if (!ok) return;
    try {
      await this.api.reasignarManzanas(ids, destino);
      this.store.manzanas.update(c =>
        c
          ? {
              ...c,
              features: c.features.map(f =>
                ids.includes(Number(f.id)) ? { ...f, properties: { ...f.properties, territorio: destino } } : f,
              ),
            }
          : c,
      );
      if (nuevo) await this.store.recargarColores();
      this.destinoMover.set(null);
      this.elegirTerritorio(destino);
      this.toast.show(`Manzanas movidas al territorio ${destino}`, 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    }
  }

  protected async eliminarTerritorio(): Promise<void> {
    const t = this.territorio();
    if (t === null) return;
    const cantidad = this.manzanasDelTerritorio().length;
    const ok = await this.ui.confirmar({
      titulo: `Eliminar el territorio ${t}`,
      mensaje: `Se borran sus ${cantidad} manzanas y su color. Los reportes anteriores se conservan, pero el territorio desaparece del mapa.`,
      accion: 'Eliminar territorio',
      peligro: true,
      escribir: String(t),
    });
    if (!ok) return;
    try {
      await this.api.eliminarTerritorio(t);
      this.store.manzanas.update(c =>
        c ? { ...c, features: c.features.filter(f => f.properties.territorio !== t) } : c,
      );
      this.elegirTerritorio(null);
      this.toast.show(`Territorio ${t} eliminado`, 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  protected async cambiarColor(color: string): Promise<void> {
    const t = this.territorio();
    if (t === null) return;
    const anterior = this.store.colores();
    this.store.colores.set({ ...anterior, [t]: color });
    try {
      await this.api.asignarColor(t, color);
    } catch (e) {
      this.store.colores.set(anterior);
      this.toast.show(mensajeDeError(e, 'No se pudo guardar el color'), 4000, 'error');
    }
  }

  // ── Importar / exportar / calidad ──

  protected elegirArchivo(): void {
    this.archivo()?.nativeElement.click();
  }

  protected async importar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    const ok = await this.ui.confirmar({
      titulo: `Importar ${archivo.name}`,
      mensaje:
        'Cada feature se agrega como manzana nueva. Necesita las propiedades "territorio" y "nombre", en coordenadas WGS84. Si alguna tiene error no se importa ninguna.',
      accion: 'Importar',
    });
    if (!ok) return;
    try {
      const resultado = await this.api.importarManzanas(await archivo.text());
      await Promise.all([this.store.cargarManzanas(true)]);
      this.toast.show(`${resultado.creadas} manzanas importadas en ${resultado.territorios.length} territorio(s)`, 4000, 'success');
      void this.revisarCalidad();
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo importar el archivo'), 10000, 'error');
    }
  }

  protected exportar(): void {
    const coleccion = this.store.manzanas();
    if (!coleccion) return;
    const salida = {
      type: 'FeatureCollection',
      features: coleccion.features.map(f => ({
        type: 'Feature',
        properties: { id: f.properties.id, territorio: f.properties.territorio, nombre: f.properties.nombre },
        geometry: f.geometry as ManzanaGeometry,
      })),
    };
    descargar(
      `manzanas-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify(salida),
      'application/geo+json',
    );
  }

  protected async revisarCalidad(): Promise<void> {
    try {
      this.calidad.set(await this.api.calidad());
    } catch {
      this.calidad.set(null);
    }
  }

  protected irAManzana(id: number): void {
    const f = this.porId().get(id);
    if (f) this.seleccionarManzana(f);
  }

  // ── Plantilla ──

  protected setFondo(f: FondoMapa): void {
    this.fondo.set(f);
    this.editor?.setFondo(f);
  }

  protected color(t: number): string {
    return this.store.colores()[t] ?? '#888888';
  }

  protected nombreDe(id: number): string {
    const f = this.porId().get(id);
    return f ? `${f.properties.nombre} (T${f.properties.territorio})` : `#${id}`;
  }

  protected numero(event: Event): number | null {
    const v = (event.target as HTMLInputElement).value.trim();
    return v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v));
  }

  protected texto(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onTerritorioForm(event: Event): void {
    const t = this.numero(event);
    this.formTerritorio.set(t);
    if (t !== null && this.modo() === 'dibujar') this.formNombre.set(this.nombreSugerido(t));
  }

  private nombreSugerido(t: number): string {
    const nombres = [...this.porId().values()]
      .filter(f => f.properties.territorio === t)
      .map(f => f.properties.nombre);
    return sugerirNombre(t, nombres);
  }

  protected readonly fmtArea = fmtArea;
}
