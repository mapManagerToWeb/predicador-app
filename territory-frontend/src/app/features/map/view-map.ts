import {
  Component,
  OnDestroy,
  inject,
  signal,
  computed,
  afterNextRender,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { TerritorioService } from '../../core/services/territorio';
import { MapEngineService } from './services/map-engine.service';
import { MapTileLayerService } from './services/map-tile-layer.service';
import { MapTerritoryLayerService } from './services/map-territory-layer.service';
import { MAP_DEFAULTS, MOVEEND_THROTTLE_MS } from './utils/map-constants';

const THEME_KEY = 'territory_theme';

/**
 * Read-only map view accessible without authentication.
 *
 * <p>Renders territory polygons on a Leaflet map with search, satellite toggle,
 * and theme toggle, but without any editing, marking, or reporting controls.</p>
 */
@Component({
  selector: 'app-view-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-map.html',
  styleUrl: './view-map.css',
})
export class ViewMapPage implements OnDestroy {
  private readonly engine = inject(MapEngineService);
  private readonly tiles = inject(MapTileLayerService);
  private readonly territories = inject(MapTerritoryLayerService);
  private readonly territorioService = inject(TerritorioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private moveEndTimer: ReturnType<typeof setTimeout> | null = null;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  isLoading = signal(true);
  isSatellite = signal(false);
  isDark = signal(this.loadTheme());

  consultaBusqueda = signal('');
  todosLosNumeros = signal<number[]>([]);
  mostrarDropdown = signal(false);
  cargandoNumeros = signal(true);

  numerosFiltrados = computed(() => {
    const consulta = this.consultaBusqueda().trim();
    const numeros = this.todosLosNumeros();
    if (!consulta) return numeros;

    const tokens = consulta
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (tokens.length === 0) return numeros;

    const matches = new Set<number>();
    for (const token of tokens) {
      for (const n of numeros) {
        if (n.toString().includes(token)) {
          matches.add(n);
        }
      }
    }
    return Array.from(matches).sort((a, b) => a - b);
  });

  constructor() {
    afterNextRender(() => this.initMap());
    this.destroyRef.onDestroy(() => {
      if (this.moveEndTimer !== null) clearTimeout(this.moveEndTimer);
      if (this.blurTimer !== null) clearTimeout(this.blurTimer);
    });
  }

  private async initMap(): Promise<void> {
    const el = document.getElementById('view-map');
    if (!el) return;

    this.applyTheme();
    this.engine.initializeMap(el);
    this.tiles.initLayers();
    this.tiles.observeThemeChanges();

    const map = this.engine.getMap();
    if (!map) return;

    map.on('moveend', () => this.throttledMoveEnd());

    await this.loadTerritories();
    void this.loadTerritorioNumeros();
  }

  private throttledMoveEnd(): void {
    if (this.moveEndTimer !== null) return;
    this.moveEndTimer = setTimeout(() => {
      this.moveEndTimer = null;
      this.territories.updateVisibleTerritories();
    }, MOVEEND_THROTTLE_MS);
  }

  private async loadTerritories(): Promise<void> {
    try {
      await this.territories.loadAllTerritories(this.territorioService);
      this.territories.updateVisibleTerritories();
    } catch {
      // Silently fail — the map will show without territory polygons
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadTerritorioNumeros(): Promise<void> {
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.todosLosNumeros.set(numeros);
    } catch {
      // Territory list stays empty
    } finally {
      this.cargandoNumeros.set(false);
    }
  }

  // ─── Search ──────────────────────────────────────────────────────

  onInput(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.consultaBusqueda.set(valor);
    this.mostrarDropdown.set(valor.length > 0);
  }

  onSeleccion(numero: number): void {
    this.consultaBusqueda.set(numero.toString());
    this.mostrarDropdown.set(false);
    this.flyToTerritorio(numero);
  }

  onFocus(): void {
    if (this.consultaBusqueda()) this.mostrarDropdown.set(true);
  }

  onBlur(): void {
    if (this.blurTimer !== null) clearTimeout(this.blurTimer);
    this.blurTimer = setTimeout(() => {
      this.mostrarDropdown.set(false);
      this.blurTimer = null;
    }, 200);
  }

  private flyToTerritorio(numero: number): void {
    this.territories.ensureTerritoryLoaded(numero);
    const fl = this.territories.getFeatureLayerByTerritorio(numero);
    if (!fl) return;
    const map = this.engine.getMap();
    if (!map) return;
    const bounds = fl.layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: MAP_DEFAULTS.boundsPadding, maxZoom: 17 });
    }
  }

  // ─── Toggle controls ────────────────────────────────────────────

  toggleSatellite(): void {
    this.tiles.toggleSatellite();
    this.isSatellite.set(this.tiles.isSatellite());
  }

  toggleTheme(): void {
    this.isDark.set(!this.isDark());
    try {
      localStorage.setItem(THEME_KEY, this.isDark() ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable (private mode)
    }
    this.applyTheme();
  }

  private loadTheme(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(THEME_KEY) === 'dark';
  }

  private applyTheme(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
  }

  goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.tiles.destroy();
    this.engine.destroy();
  }
}

