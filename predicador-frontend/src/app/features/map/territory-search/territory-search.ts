import { Component, signal, computed, output, inject, OnInit } from '@angular/core';
import { TerritorioService } from '../../../core/services/territorio';

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

  numerosFiltrados = computed(() => {
    const consulta = this.consultaBusqueda().toLowerCase();
    const numeros = this.todosLosNumeros();
    if (!consulta) return numeros;
    return numeros.filter(n => n.toString().includes(consulta));
  });

  territorySelected = output<number>();

  async ngOnInit(): Promise<void> {
    try {
      const numeros = await this.territorioService.getNumerosTerritorios();
      this.todosLosNumeros.set(numeros);
    } catch (e) {
      console.error('Error al cargar territorios', e);
    } finally {
      this.cargando.set(false);
    }
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
