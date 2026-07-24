import { Component, signal, computed, output, inject, OnInit } from '@angular/core';
import { TerritorioService } from '../../../core/services/territorio';

const THEME_KEY = 'predicador_theme';

@Component({
  selector: 'app-territory-search',
  templateUrl: './territory-search.html',
  styleUrl: './territory-search.css'
})
export class TerritorySearch implements OnInit {
  private territorioService = inject(TerritorioService);

  consultaBusqueda = signal('');
  todosLosNumeros = signal<number[]>([]);
  mostrarDropdown = signal(false);
  cargando = signal(true);
  isDark = signal(this.loadTheme());

  numerosFiltrados = computed(() => {
    const consulta = this.consultaBusqueda().toLowerCase();
    const numeros = this.todosLosNumeros();
    if (!consulta) return numeros;
    return numeros.filter(n => n.toString().includes(consulta));
  });

  territorySelected = output<number>();

  async ngOnInit(): Promise<void> {
    this.applyTheme();
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.todosLosNumeros.set(numeros);
    } catch (e) {
      console.error('Error al cargar territorios', e);
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

  onInput(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.consultaBusqueda.set(valor);
    this.mostrarDropdown.set(valor.length > 0);
  }

  onSeleccion(numero: number): void {
    this.consultaBusqueda.set(numero.toString());
    this.mostrarDropdown.set(false);
    this.territorySelected.emit(numero);
  }

  onFocus(): void {
    if (this.consultaBusqueda()) this.mostrarDropdown.set(true);
  }

  onBlur(): void {
    setTimeout(() => this.mostrarDropdown.set(false), 200);
  }
}
