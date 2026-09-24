import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { environment } from '../../../environments/environment';
import {
  cambiarFondo,
  crearMapa,
  etiquetasTerritorios,
  type FondoMapa,
  limites,
  limitesPrincipales,
  temaOscuro,
} from '../../core/map/base-map';
import {
  type EstadoTerritorioPublico,
  hace,
  manzanasDelVisor,
  type ManzanaVisor,
  type PropsManzanaPublica,
  resumenTerritorios,
  type ResumenTerritorio,
  zonasParcialesDelVisor,
} from './visor-estado';

const CLAVE_TEMA = 'territory_theme';
type ColeccionVisor = FeatureCollection<Polygon | MultiPolygon, ManzanaVisor['properties']>;

/**
 * Visor público de territorios: sin iniciar sesión y sin editar. Muestra qué
 * manzanas y calles se predicaron en la vuelta en curso de cada territorio y
 * cuándo se trabajó o completó, sin datos de personas.
 */
@Component({
  selector: 'app-visor',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visor.html',
  styleUrl: './visor.css',
})
export class VisorPage {
  private readonly http = inject(HttpClient);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private map: MapLibreMap | null = null;
  private manzanas: ColeccionVisor | null = null;

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fondo = signal<FondoMapa>('mapa');
  protected readonly verLeyenda = signal(false);
  protected readonly busqueda = signal('');
  protected readonly resumen = signal<Map<number, ResumenTerritorio>>(new Map());
  protected readonly seleccionado = signal<number | null>(null);
  protected readonly ficha = computed(() => {
    const t = this.seleccionado();
    return t === null ? null : (this.resumen().get(t) ?? null);
  });
  protected readonly totales = computed(() => {
    const lista = [...this.resumen().values()];
    return {
      territorios: lista.length,
      completados: lista.filter(r => r.situacion === 'completado').length,
      enCurso: lista.filter(r => r.situacion === 'en-curso').length,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.aplicarTemaGuardado();
      void this.iniciar();
      const observador = new MutationObserver(() => {
        if (this.map) cambiarFondo(this.map, this.fondo(), temaOscuro());
      });
      observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      destroyRef.onDestroy(() => {
        observador.disconnect();
        this.map?.remove();
      });
    });
  }

  private async iniciar(): Promise<void> {
    try {
      // Los datos se piden en paralelo con la carga de MapLibre.
      const datos = this.cargarDatos();
      const { maplibre, map } = await crearMapa(this.contenedor().nativeElement);
      this.map = map;
      map.addControl(
        new maplibre.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
        'top-right',
      );
      const { manzanas, zonas } = await datos;
      this.manzanas = manzanas;
      this.agregarCapas(map, manzanas, zonas);
      const caja = limitesPrincipales(manzanas);
      if (caja) map.fitBounds(caja, { padding: 24, duration: 0 });
    } catch {
      this.error.set('No se pudieron cargar los territorios. Revisa la conexión y vuelve a intentar.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarDatos(): Promise<{ manzanas: ColeccionVisor; zonas: ReturnType<typeof zonasParcialesDelVisor> }> {
    const api = environment.apiUrl;
    // El estado cambia con cada reporte: saltar el service worker para no mostrar uno viejo.
    const sinCacheSw = new HttpHeaders({ 'ngsw-bypass': 'true' });
    const [geojson, colores, estados] = await Promise.all([
      firstValueFrom(
        this.http.get<FeatureCollection<Polygon | MultiPolygon, PropsManzanaPublica>>(`${api}/territories/all/geojson`),
      ),
      firstValueFrom(this.http.get<Record<number, string>>(`${api}/territories/colors`)),
      firstValueFrom(
        this.http.get<EstadoTerritorioPublico[]>(`${api}/reports/public/estado`, { headers: sinCacheSw }),
      ),
    ]);
    const manzanas = manzanasDelVisor(geojson, estados, colores);
    this.resumen.set(resumenTerritorios(manzanas, estados));
    return { manzanas, zonas: zonasParcialesDelVisor(estados, colores) };
  }

  private agregarCapas(map: MapLibreMap, manzanas: ColeccionVisor, zonas: ReturnType<typeof zonasParcialesDelVisor>): void {
    const color: ExpressionSpecification = ['get', 'color'];
    map.addSource('manzanas', { type: 'geojson', data: manzanas });
    map.addSource('zonas', { type: 'geojson', data: zonas });
    map.addSource('etiquetas', { type: 'geojson', data: etiquetasTerritorios(manzanas) });
    map.addLayer({
      id: 'manzanas-fill',
      type: 'fill',
      source: 'manzanas',
      paint: {
        'fill-color': color,
        'fill-opacity': ['case', ['get', 'predicada'], 0.62, 0.1],
      },
    });
    map.addLayer({ id: 'zonas-fill', type: 'fill', source: 'zonas', paint: { 'fill-color': color, 'fill-opacity': 0.62 } });
    map.addLayer({
      id: 'manzanas-line',
      type: 'line',
      source: 'manzanas',
      paint: { 'line-color': color, 'line-width': 1.2 },
    });
    map.addLayer({
      id: 'territorio-sel',
      type: 'line',
      source: 'manzanas',
      filter: ['==', ['get', 'territorio'], -1],
      paint: { 'line-color': '#111827', 'line-width': 3 },
    });
    map.addLayer({
      id: 'etiquetas',
      type: 'symbol',
      source: 'etiquetas',
      minzoom: 12.5,
      layout: { 'text-field': ['get', 'etiqueta'], 'text-font': ['Open Sans Semibold'], 'text-size': 13 },
      paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    });
    map.on('click', 'manzanas-fill', e => {
      const t = e.features?.[0]?.properties?.['territorio'] as number | undefined;
      if (t !== undefined) this.seleccionar(t, false);
    });
    map.on('mouseenter', 'manzanas-fill', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'manzanas-fill', () => (map.getCanvas().style.cursor = ''));
  }

  protected alternarLeyenda(): void {
    const ver = !this.verLeyenda();
    // Leyenda y ficha ocupan el mismo lugar: se muestra una sola.
    if (ver) this.seleccionar(null);
    this.verLeyenda.set(ver);
  }

  protected seleccionar(territorio: number | null, enfocar = true): void {
    this.seleccionado.set(territorio);
    if (territorio !== null) this.verLeyenda.set(false);
    if (!this.map) return;
    this.map.setFilter('territorio-sel', ['==', ['get', 'territorio'], territorio ?? -1]);
    if (territorio !== null && enfocar && this.manzanas) {
      const caja = limites(this.manzanas, territorio);
      if (caja) this.map.fitBounds(caja, { padding: { top: 90, left: 32, right: 32, bottom: 230 }, maxZoom: 17.5 });
    }
  }

  protected buscar(event: Event): void {
    event.preventDefault();
    const numero = Number(this.busqueda().trim());
    if (!Number.isInteger(numero) || !this.resumen().has(numero)) {
      this.error.set(this.busqueda().trim() ? `No existe el territorio ${this.busqueda().trim()}` : null);
      return;
    }
    this.error.set(null);
    this.seleccionar(numero);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  protected onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value.replace(/\D/g, ''));
  }

  protected alternarFondo(): void {
    this.fondo.set(this.fondo() === 'mapa' ? 'satelite' : 'mapa');
    if (this.map) cambiarFondo(this.map, this.fondo(), temaOscuro());
  }

  protected alternarTema(): void {
    const oscuro = !temaOscuro();
    document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
    try {
      localStorage.setItem(CLAVE_TEMA, oscuro ? 'dark' : 'light');
    } catch {
      // Sin almacenamiento el tema vale solo para esta visita.
    }
  }

  private aplicarTemaGuardado(): void {
    let oscuro = false;
    try {
      oscuro = localStorage.getItem(CLAVE_TEMA) === 'dark';
    } catch {
      // Tema claro por defecto, igual que el mapa de los encargados.
    }
    document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
  }

  protected readonly hace = hace;
  protected fecha(d: Date): string {
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
