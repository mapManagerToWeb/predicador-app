import { Component, AfterViewInit, OnDestroy, signal, computed, inject, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';
import { Profile } from '../../core/services/profile';
import { TerritorySearch } from './territory-search/territory-search';
import { ReportPage } from '../report/report';

interface ManzanaMarcada {
  id: string;
  nombreBloque: string;
  layer: L.Path;
}

interface FeatureLayer {
  territorioPadre: number;
  color: string;
  layer: L.GeoJSON;
  centroidMarkers: L.Marker[];
}

@Component({
  selector: 'app-map',
  imports: [TerritorySearch, ReportPage],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class MapPage implements AfterViewInit, OnDestroy {
  private territorioService = inject(TerritorioService);
  private toastService = inject(Toast);
  private profileService = inject(Profile);
  private map!: L.Map;
  private allTerritoriesLayer: FeatureLayer[] = [];

  manzanasMarcadas = signal<ManzanaMarcada[]>([]);
  manzanasCount = computed(() => this.manzanasMarcadas().length);
  territorioSeleccionado = signal<number | null>(null);
  tieneTerritorio = computed(() => this.territorioSeleccionado() !== null);

  @ViewChild(ReportPage) reportComponent!: ReportPage;

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 0);
  }

  private initMap(): void {
    this.map = L.map('map', {
      preferCanvas: true,
      zoomControl: false
    }).setView([-37.472, -73.347], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.loadAllTerritories();
  }

  private async loadAllTerritories(): Promise<void> {
    try {
      const geoJsonText = await this.territorioService.getAllGeoJson();
      const geoJson = JSON.parse(geoJsonText) as GeoJSON.FeatureCollection;

      const byTerritorio = new Map<number, GeoJSON.Feature[]>();
      for (const feature of geoJson.features) {
        const num = feature.properties?.['territorio_padre'];
        if (num) {
          if (!byTerritorio.has(num)) byTerritorio.set(num, []);
          byTerritorio.get(num)!.push(feature);
        }
      }

      for (const [territorioNum, features] of byTerritorio) {
        const color = features[0]?.properties?.['color'] || '#3b82f6';

        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

        const layer = L.geoJSON(fc, {
          style: () => ({
            fillColor: color,
            fillOpacity: 0.25,
            color: color,
            weight: 2
          }),
          onEachFeature: (feature, l) => {
            if (l instanceof L.Path) {
              const id = feature.properties?.['id'] || '';
              const nombreBloque = feature.properties?.['nombre_bloque'] || '';

              l.on('click', (e) => {
                L.DomEvent.stop(e);
                this.toggleManzana(id, nombreBloque, l, color);
              });
            }
          }
        });

        layer.addTo(this.map);

        const centroidMarkers = this.agregarMarcadoresCentroide(fc, color, territorioNum);

        this.allTerritoriesLayer.push({
          territorioPadre: territorioNum,
          color,
          layer,
          centroidMarkers
        });
      }

      const allBounds = this.allTerritoriesLayer
        .map(f => f.layer.getBounds())
        .filter(b => b.isValid());

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
        this.map.fitBounds(combined, { padding: [30, 30] });
      }
    } catch (e) {
      console.error('Error al cargar territorios', e);
      this.toastService.show('Error al cargar los territorios');
    }
  }

  async onTerritorioSeleccionado(numero: number): Promise<void> {
    this.limpiarMarcas();
    this.territorioSeleccionado.set(numero);

    const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === numero);
    if (!featureLayer) {
      this.toastService.show('Territorio no encontrado');
      return;
    }

    featureLayer.layer.eachLayer(l => {
      if (l instanceof L.Path) {
        l.setStyle({ fillOpacity: 0.5, weight: 3 });
      }
    });

    const bounds = featureLayer.layer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  private agregarMarcadoresCentroide(geoJson: GeoJSON.FeatureCollection, color: string, territorioNum: number): L.Marker[] {
    let totalLat = 0, totalLng = 0, count = 0;

    for (const feature of geoJson.features) {
      if (feature.geometry.type === 'Polygon') {
        for (const coord of feature.geometry.coordinates[0]) {
          totalLat += coord[1];
          totalLng += coord[0];
          count++;
        }
      }
    }

    if (count === 0) return [];

    const lat = totalLat / count;
    const lng = totalLng / count;

    const icon = L.divIcon({
      className: 'centroid-label',
      html: `<div class="centroid-dot" style="background:${color}">${territorioNum}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(this.map);
    return [marker];
  }

  private toggleManzana(id: string, nombreBloque: string, layer: L.Path, color: string): void {
    const current = [...this.manzanasMarcadas()];
    const idx = current.findIndex(m => m.id === id);

    if (idx >= 0) {
      current.splice(idx, 1);
      layer.setStyle({ fillColor: color, fillOpacity: 0.5, color: color, weight: 3 });
    } else {
      current.push({ id, nombreBloque, layer });
      layer.setStyle({ fillColor: '#22c55e', fillOpacity: 0.6, color: '#16a34a', weight: 3 });
    }

    this.manzanasMarcadas.set(current);
  }

  limpiarMarcas(): void {
    this.manzanasMarcadas.set([]);
    for (const fl of this.allTerritoriesLayer) {
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ fillColor: fl.color, fillOpacity: 0.25, color: fl.color, weight: 2 });
        }
      });
    }
    this.territorioSeleccionado.set(null);
  }

  limpiarTodo(): void {
    this.limpiarMarcas();
    this.loadAllTerritories();
  }

  onSendReport(): void {
    const territorio = this.territorioSeleccionado();
    if (territorio && this.reportComponent) {
      const manzanaIds = this.manzanasMarcadas().map(m => parseInt(m.id.split('-')[1]) || 0);
      const nombreBloques = this.manzanasMarcadas().map(m => m.nombreBloque);
      this.reportComponent.enviarReporte(territorio, this.manzanasCount(), nombreBloques, manzanaIds);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
