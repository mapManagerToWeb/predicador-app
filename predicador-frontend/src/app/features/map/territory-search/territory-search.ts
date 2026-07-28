import { Component, signal, computed, output, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { TerritorioService } from '../../../core/services/territorio';
import { Profile } from '../../../core/services/profile';
import { AuthTokenService } from '../../../core/services/auth-token';

const THEME_KEY = 'predicador_theme';

@Component({
  selector: 'app-territory-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './territory-search.html',
  styleUrl: './territory-search.css'
})
export class TerritorySearch implements OnInit {
  private territorioService = inject(TerritorioService);
  private profileService = inject(Profile);
  private authToken = inject(AuthTokenService);
  private router = inject(Router);

  consultaBusqueda = signal('');
  todosLosNumeros = signal<number[]>([]);
  mostrarDropdown = signal(false);
  cargando = signal(true);
  isDark = signal(this.loadTheme());

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

  territoriosSeleccionados = computed(() => {
    const consulta = this.consultaBusqueda().trim();
    if (!consulta) return [];
    const tokens = consulta
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
    if (tokens.length === 0) return [];

    const matches = new Set<number>();
    for (const token of tokens) {
      for (const n of this.todosLosNumeros()) {
        if (n.toString() === token) {
          matches.add(n);
        }
      }
    }
    return Array.from(matches).sort((a, b) => a - b);
  });

  seleccionMultiple = computed(() => {
    const consulta = this.consultaBusqueda().trim();
    if (!consulta) return false;
    const tokens = consulta.split(/[,\s]+/).map(t => t.trim()).filter(t => t.length > 0);
    return tokens.length > 1;
  });

  territorySelected = output<number[]>();

  async ngOnInit(): Promise<void> {
    this.applyTheme();
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.todosLosNumeros.set(numeros);
    } catch {
      // Error handled silently — territory list stays empty
    } finally {
      this.cargando.set(false);
    }
  }

  private loadTheme(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(THEME_KEY) === 'dark';
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
  }

  toggleTheme(): void {
    this.isDark.set(!this.isDark());
    localStorage.setItem(THEME_KEY, this.isDark() ? 'dark' : 'light');
    this.applyTheme();
  }

  logout(): void {
    this.profileService.clear();
    this.authToken.clear();
    void this.router.navigate(['/login']);
  }

  onInput(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.consultaBusqueda.set(valor);
    this.mostrarDropdown.set(valor.length > 0);
    
    // Emitir array vacío cuando se limpia la búsqueda para deseleccionar territorios
    if (valor.trim() === '') {
      this.territorySelected.emit([]);
    }
  }

  onSeleccion(numero: number): void {
    this.consultaBusqueda.set(numero.toString());
    this.mostrarDropdown.set(false);
    this.territorySelected.emit([numero]);
  }

  onSeleccionMultiple(): void {
    const seleccionados = this.territoriosSeleccionados();
    if (seleccionados.length === 0) return;
    this.mostrarDropdown.set(false);
    this.territorySelected.emit(seleccionados);
  }

  onFocus(): void {
    if (this.consultaBusqueda()) this.mostrarDropdown.set(true);
  }

  onBlur(): void {
    setTimeout(() => this.mostrarDropdown.set(false), 200);
  }
}
