import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { environment } from '../../../environments/environment';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { ReportCacheService } from '../../core/services/report-cache';
import { DraftMarksService } from '../../core/services/map-draft';
import { estaEnLista, idsDeLista, type EstadoTerritorioPublico } from '../../core/map/estado-publico';
import type { Reporte, RegistroReporte } from '../../core/models/models';
import { WhatsAppService } from './services/whatsapp';
import { elegirUltimoReporte } from './utils/report-utils';
import { getColorForTerritorio } from './utils/territory-colors';
import { calcularLados, leerZonas, type GeometriaManzana } from './utils/lados';
import { comodidadDeToque } from '../../core/map/geometria';
import { leerBorrador, serializarBorrador } from './utils/borrador';
import {
  abrirTerritorio,
  alternarManzana,
  BASE_VACIA,
  baseDesdeReporte,
  envioDe,
  guardarLados,
  hayCambios,
  ladosElegidos,
  ladosDeLaBase,
  enteraEnLaBase,
  registroDe,
  resumir,
  turnoPorHora,
  type BaseTerritorio,
  type Manzana,
  type ResumenTerritorio,
  type TerritorioSalida,
} from './utils/salida';
import type { EdicionLados, ModoMarcado, Pregunta } from './mapa.types';
import type { EstadoVista, Toque } from './mapa-vista';

/** Lo que el store usa del mapa (interfaz chica para poder probarlo sin WebGL). */
export interface VistaMapa {
  mostrar(e: EstadoVista): void;
  encuadrar(territorios: number[], animar?: boolean): void;
  mostrarLados(ed: EdicionLados | null, encuadrar?: boolean): void;
  capturar(territorios: number[]): Promise<string | null>;
  /** Práctica del tutorial: un aro que late sobre la manzana a tocar (null lo quita). */
  resaltarManzana?(id: string | null): void;
  /** Acerca el mapa a una manzana (la práctica la muestra grande, fácil de tocar). */
  encuadrarManzana?(id: string): void;
  /** Centro del mapa [lng, lat], para elegir un territorio de práctica cercano. */
  centro?(): [number, number];
  /** Lo que tapan la tarjeta del tutorial (arriba) y el panel (abajo), en px. */
  ajustarMargenes?(m: { arriba?: number; abajo?: number }): void;
}

interface PropsManzanaApi {
  id: string;
  mid?: number;
  nombre_bloque: string;
  territorio_padre: number;
  color: string | null;
}

export interface ResumenAbierto extends ResumenTerritorio {
  color: string;
  base: BaseTerritorio | null;
}

const CACHE_DATOS = 'mapa.datos.v1';
const INTENTOS_CARGA = 6;
const ESPERA_REINTENTO_MS = 3000;

/**
 * Estado y reglas del mapa de marcado. Un toque en una manzana:
 * - sin territorio abierto, abre su territorio;
 * - en un territorio abierto, la marca o la desmarca (modo "manzana entera"),
 *   o abre sus calles (modo "por calles");
 * - en otro territorio, pregunta si agregarlo a la salida.
 * Nada se borra ni se envía sin preguntar.
 */
@Injectable()
export class MapaStore {
  private readonly http = inject(HttpClient);
  private readonly territorios = inject(TerritorioService);
  private readonly perfil = inject(Profile);
  private readonly toast = inject(Toast);
  private readonly whatsapp = inject(WhatsAppService);
  private readonly cacheReportes = inject(ReportCacheService);
  private readonly borrador = inject(DraftMarksService);

  private vista: VistaMapa | null = null;
  private readonly manzanasPorId = new Map<string, Manzana>();
  private readonly manzanasPorTerritorio = new Map<number, Manzana[]>();
  private colores: Record<number, string> = {};
  private restaurado = false;
  private temporizadorBorrador: ReturnType<typeof setTimeout> | null = null;

  readonly cargando = signal(true);
  readonly errorCarga = signal(false);
  readonly numeros = signal<number[]>([]);
  readonly estados = signal<Map<number, EstadoTerritorioPublico>>(new Map());

  readonly abiertos = signal<number[]>([]);
  readonly salida = signal<Map<number, TerritorioSalida>>(new Map());
  readonly cargandoTerritorio = signal<number | null>(null);
  readonly modo = signal<ModoMarcado>('manzana');
  readonly edicion = signal<EdicionLados | null>(null);
  readonly predicacion = signal<'mañana' | 'tarde'>(turnoPorHora());
  readonly inicioSesion = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly pregunta = signal<Pregunta | null>(null);
  /**
   * Práctica del tutorial: un territorio de ejemplo sin marcas. Lo que se hace
   * no se guarda en el borrador ni se envía, y al terminar todo vuelve a como
   * estaba (incluidos los territorios que el encargado tenía abiertos).
   */
  readonly practica = signal(false);
  private antesDePracticar: {
    abiertos: number[];
    salida: Map<number, TerritorioSalida>;
    modo: ModoMarcado;
    predicacion: 'mañana' | 'tarde';
    inicioSesion: string | null;
  } | null = null;

  readonly resumenes = computed<ResumenAbierto[]>(() => {
    const salida = this.salida();
    return this.abiertos()
      .filter(n => salida.has(n))
      .map(n => ({
        ...resumir(salida.get(n)!, this.total(n)),
        color: this.colorDe(n),
        base: salida.get(n)!.base,
      }));
  });
  readonly hayCambios = computed(() => this.resumenes().some(r => r.cambios));

  /** Manzanas de la vuelta en curso de cada territorio (para los que no están abiertos). */
  private readonly predicadas = computed(() => {
    const ids = new Set<string>();
    for (const e of this.estados().values()) {
      const lista = idsDeLista(e.manzanasIds);
      for (const m of this.manzanasPorTerritorio.get(e.territorio) ?? []) {
        if (estaEnLista(lista, m.id, m.mid)) ids.add(m.id);
      }
    }
    return ids;
  });

  readonly estadoVista = computed<EstadoVista>(() => {
    const abiertos = new Set(this.abiertos());
    const marcadas = new Set<string>();
    const zonas: EstadoVista['zonas']['features'] = [];
    for (const id of this.predicadas()) {
      if (!abiertos.has(this.manzanasPorId.get(id)?.territorio ?? -1)) marcadas.add(id);
    }
    for (const e of this.estados().values()) {
      if (abiertos.has(e.territorio) || !e.geometriaParcial) continue;
      for (const z of leerZonas(e.geometriaParcial, null)) {
        zonas.push({ type: 'Feature', geometry: z.geometria, properties: { territorio: e.territorio, color: this.colorDe(e.territorio) } });
      }
    }
    for (const t of this.salida().values()) {
      if (!abiertos.has(t.numero)) continue;
      for (const id of t.marcadas) marcadas.add(id);
      for (const z of t.zonas) {
        zonas.push({ type: 'Feature', geometry: z.geometria, properties: { territorio: t.numero, color: this.colorDe(t.numero) } });
      }
    }
    return {
      abiertos: [...abiertos],
      marcadas,
      zonas: { type: 'FeatureCollection', features: zonas },
      editando: this.edicion()?.manzanaId ?? null,
    };
  });

  constructor() {
    // Borrador: lo marcado sin enviar sobrevive a recargas y cierres del navegador.
    effect(() => {
      const datos = {
        abiertos: this.abiertos(),
        territorios: [...this.salida().values()],
        predicacion: this.predicacion(),
        inicioSesion: this.inicioSesion(),
      };
      const enPractica = this.practica();
      untracked(() => {
        if (!this.restaurado || enPractica) return;
        if (this.temporizadorBorrador) clearTimeout(this.temporizadorBorrador);
        this.temporizadorBorrador = setTimeout(() => {
          if (datos.territorios.length === 0) this.borrador.clear();
          else this.borrador.guardar(serializarBorrador(datos));
        }, 300);
      });
    });
  }

  conectar(vista: VistaMapa): void {
    this.vista = vista;
  }

  // ── Datos ──

  manzanas(): Manzana[] {
    return [...this.manzanasPorId.values()];
  }

  manzana(id: string): Manzana | undefined {
    return this.manzanasPorId.get(id);
  }

  colorDe(territorio: number): string {
    return this.colores[territorio] ?? getColorForTerritorio(territorio, null);
  }

  total(territorio: number): number {
    return this.manzanasPorTerritorio.get(territorio)?.length ?? 0;
  }

  /**
   * Carga manzanas, colores y el estado de cada territorio (con reintentos:
   * tras un reinicio del servidor los servicios tardan en estar listos). Sin
   * red usa la última copia guardada en el teléfono.
   */
  async cargar(): Promise<boolean> {
    this.cargando.set(true);
    this.errorCarga.set(false);
    try {
      let datos: { geojson: string; colores: Record<number, string>; estados: EstadoTerritorioPublico[] } | null = null;
      for (let intento = 1; intento <= INTENTOS_CARGA && !datos; intento++) {
        try {
          datos = await this.descargar();
          this.guardarCopia(datos);
        } catch (e) {
          const copia = this.leerCopia();
          if (copia) {
            datos = copia;
            this.toast.show('Sin conexión: se muestra la última copia guardada', 4000, 'warning');
          } else if (intento === INTENTOS_CARGA || (e instanceof HttpErrorResponse && e.status === 401)) {
            throw e;
          } else {
            await new Promise(r => setTimeout(r, ESPERA_REINTENTO_MS));
          }
        }
      }
      this.procesar(datos!);
      this.restaurarBorrador();
      return true;
    } catch {
      this.errorCarga.set(true);
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  private async descargar(): Promise<{ geojson: string; colores: Record<number, string>; estados: EstadoTerritorioPublico[] }> {
    const [geojson, colores, estados] = await Promise.all([
      this.territorios.getAllGeoJson(),
      this.territorios.getColores(),
      firstValueFrom(
        this.http.get<EstadoTerritorioPublico[]>(`${environment.apiUrl}/reports/public/estado`, {
          headers: new HttpHeaders({ 'ngsw-bypass': 'true' }),
        }),
      ),
    ]);
    return { geojson, colores, estados };
  }

  private guardarCopia(datos: object): void {
    try {
      localStorage.setItem(CACHE_DATOS, JSON.stringify(datos));
    } catch {
      // Sin espacio o sin almacenamiento: la próxima vez sin red no habrá copia.
    }
  }

  private leerCopia(): { geojson: string; colores: Record<number, string>; estados: EstadoTerritorioPublico[] } | null {
    try {
      const texto = localStorage.getItem(CACHE_DATOS);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }

  private procesar(datos: { geojson: string; colores: Record<number, string>; estados: EstadoTerritorioPublico[] }): void {
    this.colores = datos.colores ?? {};
    const fc = JSON.parse(datos.geojson) as FeatureCollection<Polygon | MultiPolygon, PropsManzanaApi>;
    this.manzanasPorId.clear();
    this.manzanasPorTerritorio.clear();
    for (const f of fc.features) {
      const p = f.properties;
      if (!f.geometry || !p || p.territorio_padre === undefined) continue;
      const m: Manzana = { id: p.id, mid: p.mid, nombre: p.nombre_bloque, territorio: p.territorio_padre, geometria: f.geometry as GeometriaManzana };
      if (!this.colores[m.territorio]) this.colores[m.territorio] = getColorForTerritorio(m.territorio, p.color);
      this.manzanasPorId.set(m.id, m);
      const lista = this.manzanasPorTerritorio.get(m.territorio) ?? [];
      lista.push(m);
      this.manzanasPorTerritorio.set(m.territorio, lista);
    }
    this.numeros.set([...this.manzanasPorTerritorio.keys()].sort((a, b) => a - b));
    this.estados.set(new Map((datos.estados ?? []).map(e => [e.territorio, e])));
  }

  private restaurarBorrador(): void {
    const b = leerBorrador(this.borrador.cargar());
    if (b) {
      const existentes = b.territorios.filter(t => this.manzanasPorTerritorio.has(t.numero));
      this.salida.set(new Map(existentes.map(t => [t.numero, t])));
      this.abiertos.set(b.abiertos.filter(n => this.manzanasPorTerritorio.has(n)));
      if (existentes.some(hayCambios)) {
        this.predicacion.set(b.predicacion);
        this.inicioSesion.set(b.inicioSesion);
      }
      // Borradores de la versión anterior: falta saber qué tenía el último reporte.
      for (const t of existentes) if (!t.base) void this.completarBase(t.numero);
    }
    this.restaurado = true;
  }

  private async completarBase(numero: number): Promise<void> {
    const base = await this.cargarBase(numero);
    this.salida.update(s => {
      const t = s.get(numero);
      return t ? new Map(s).set(numero, { ...t, base }) : s;
    });
  }

  /** Qué dice el último reporte del territorio (con alternativas sin red). */
  private async cargarBase(numero: number): Promise<BaseTerritorio> {
    const manzanas = this.manzanasPorTerritorio.get(numero) ?? [];
    try {
      const reportes = await this.territorios.getReportesPorTerritorio(numero);
      return baseDesdeReporte(elegirUltimoReporte(reportes), manzanas);
    } catch {
      const cacheado = this.cacheReportes.getCache().get(numero);
      if (cacheado) return baseDesdeReporte(cacheado, manzanas);
      const e = this.estados().get(numero);
      if (!e?.ultimoTrabajo) return BASE_VACIA;
      return baseDesdeReporte(
        {
          id: 0, manzanaId: null, fecha: e.ultimoTrabajo, encargadoId: 0, encargadoNombre: '', encargadoApellido: '',
          sessionTime: e.ultimoTrabajo, estado: e.estado === 'completed' ? 'completed' : 'incomplete',
          territorioNumero: numero, totalManzanas: e.totalManzanas ?? 0, manzanasMarcadas: e.manzanasMarcadas ?? 0,
          tipoSesion: 'parcial', geometriaParcial: e.geometriaParcial, puntosParciales: null, manzanasIds: e.manzanasIds,
        },
        manzanas,
      );
    }
  }

  // ── Territorios ──

  /** Abre un territorio para marcar (o lo encuadra si ya estaba abierto). */
  async abrir(numero: number): Promise<void> {
    if (this.avisarPractica()) return;
    if (!this.manzanasPorTerritorio.has(numero)) {
      this.toast.show(`No existe el territorio ${numero}`, 3000, 'warning');
      return;
    }
    if (this.abiertos().includes(numero)) {
      this.vista?.encuadrar([numero]);
      return;
    }
    this.abiertos.update(a => [...a, numero]);
    this.vista?.encuadrar(this.abiertos());
    if (this.salida().has(numero)) return;
    this.cargandoTerritorio.set(numero);
    try {
      const base = await this.cargarBase(numero);
      if (!this.abiertos().includes(numero)) return;
      this.salida.update(s => new Map(s).set(numero, abrirTerritorio(numero, base)));
    } finally {
      this.cargandoTerritorio.set(null);
    }
  }

  /** Abre los territorios escritos en el buscador ("71" o "71, 72"). */
  async buscar(texto: string): Promise<void> {
    const numeros = [...new Set((texto.match(/\d+/g) ?? []).map(Number))];
    for (const n of numeros) await this.abrir(n);
  }

  /** Cierra un territorio; si tiene algo sin enviar, pregunta antes. */
  cerrar(numero: number): void {
    if (this.avisarPractica()) return;
    const t = this.salida().get(numero);
    if (t && hayCambios(t)) {
      this.pregunta.set({
        titulo: `¿Descartar lo marcado en el territorio ${numero}?`,
        texto: 'Todavía no lo enviaste. Si cierras el territorio, se pierde.',
        si: 'Descartar',
        no: 'Seguir marcando',
        peligro: true,
        alConfirmar: () => this.quitar(numero),
      });
      return;
    }
    this.quitar(numero);
  }

  private quitar(numero: number): void {
    if (this.edicion()?.territorio === numero) this.cancelarLados();
    this.abiertos.update(a => a.filter(n => n !== numero));
    this.salida.update(s => {
      const nueva = new Map(s);
      nueva.delete(numero);
      return nueva;
    });
    if (this.abiertos().length === 0) {
      this.modo.set('manzana');
      this.inicioSesion.set(null);
    }
  }

  private proponerAgregar(numero: number): void {
    const abiertos = this.abiertos().join(', ');
    this.pregunta.set({
      titulo: `¿Agregar el territorio ${numero}?`,
      texto: `Tienes abierto el ${abiertos}. Si lo agregas, se marcan y se envían juntos.`,
      si: `Agregar el ${numero}`,
      no: 'No',
      alConfirmar: () => void this.abrir(numero),
    });
  }

  // ── Práctica del tutorial ──

  private avisarPractica(): boolean {
    if (this.practica()) this.toast.show('Estás en la práctica: sigue los pasos del tutorial', 2500);
    return this.practica();
  }

  /**
   * Territorio y manzana para practicar: el territorio de la manzana más
   * cercana al centro del mapa (uno que el encargado reconoce) y, dentro de
   * él, la manzana grande y compacta más fácil de tocar (no una franja larga).
   */
  sugerirPractica(): { territorio: number; manzana: string } | null {
    const centro = this.vista?.centro?.();
    let cercana: Manzana | undefined;
    let mejor = Infinity;
    for (const m of this.manzanasPorId.values()) {
      if (!centro) {
        cercana = m;
        break;
      }
      const [x, y] = primerPunto(m.geometria);
      const d = (x - centro[0]) ** 2 + (y - centro[1]) ** 2;
      if (d < mejor) {
        mejor = d;
        cercana = m;
      }
    }
    if (!cercana) return null;
    const delTerritorio = this.manzanasPorTerritorio.get(cercana.territorio) ?? [cercana];
    const comoda = delTerritorio.reduce((a, b) => (comodidadDeToque(b.geometria) > comodidadDeToque(a.geometria) ? b : a));
    return { territorio: cercana.territorio, manzana: comoda.id };
  }

  iniciarPractica(territorio: number): void {
    if (this.practica() || !this.manzanasPorTerritorio.has(territorio)) return;
    if (this.edicion()) this.cerrarLados();
    this.pregunta.set(null);
    this.antesDePracticar = {
      abiertos: this.abiertos(),
      salida: this.salida(),
      modo: this.modo(),
      predicacion: this.predicacion(),
      inicioSesion: this.inicioSesion(),
    };
    this.practica.set(true);
    this.abiertos.set([territorio]);
    this.salida.set(new Map([[territorio, abrirTerritorio(territorio, BASE_VACIA)]]));
    this.modo.set('manzana');
  }

  terminarPractica(): void {
    if (!this.practica()) return;
    this.cerrarLados();
    this.vista?.resaltarManzana?.(null);
    const antes = this.antesDePracticar!;
    this.abiertos.set(antes.abiertos);
    this.salida.set(antes.salida);
    this.modo.set(antes.modo);
    this.predicacion.set(antes.predicacion);
    this.inicioSesion.set(antes.inicioSesion);
    this.antesDePracticar = null;
    this.practica.set(false);
    if (antes.abiertos.length) this.vista?.encuadrar(antes.abiertos);
  }

  resaltarManzana(id: string | null): void {
    this.vista?.resaltarManzana?.(id);
  }

  encuadrarManzana(id: string): void {
    this.vista?.encuadrarManzana?.(id);
  }

  ajustarMargenes(m: { arriba?: number; abajo?: number }): void {
    this.vista?.ajustarMargenes?.(m);
  }

  // ── Marcado ──

  /** Qué hacer con un toque en el mapa (ver la descripción de la clase). */
  tocar(t: Toque): void {
    if (this.enviando() || this.pregunta()) return;
    const porCalles = this.modo() === 'calles';
    const id = t.manzana ?? (porCalles ? t.cercana : null);
    const m = id ? this.manzanasPorId.get(id) : undefined;
    if (!m) return;

    if (this.abiertos().length === 0) {
      void this.abrir(m.territorio);
      return;
    }
    if (!this.abiertos().includes(m.territorio)) {
      if (!this.avisarPractica()) this.proponerAgregar(m.territorio);
      return;
    }
    if (this.cargandoTerritorio() === m.territorio || !this.salida().has(m.territorio)) return;

    if (porCalles) {
      const ed = this.edicion();
      if (ed?.manzanaId === m.id) return;
      if (ed) this.guardarLados(false);
      this.abrirLados(m);
      return;
    }
    const antes = this.salida().get(m.territorio)!;
    if (antes.marcadas.includes(m.id) && enteraEnLaBase(antes, m.id)) {
      this.avisarYaReportada(m, antes);
      return;
    }
    this.actualizar(m.territorio, t => alternarManzana(t, m));
    const marcada = this.salida().get(m.territorio)!.marcadas.includes(m.id);
    if (!marcada && antes.marcadas.includes(m.id)) this.toast.show(`Manzana ${m.nombre} desmarcada`, 1500);
  }

  /**
   * Lo que ya llegó en un reporte enviado no se deshace desde el mapa: se
   * corrige desde el panel de administración (queda registrado).
   */
  private avisarYaReportada(m: Manzana, t: TerritorioSalida): void {
    const fecha = t.base?.fecha ? ` el ${new Date(t.base.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}` : '';
    this.toast.show(`La manzana ${m.nombre} ya se reportó${fecha}. Si fue un error, avisa al administrador.`, 4000, 'warning');
  }

  cambiarModo(modo: ModoMarcado): void {
    if (this.modo() === modo) return;
    if (this.edicion()) this.guardarLados(false);
    this.modo.set(modo);
  }

  private abrirLados(m: Manzana): void {
    const lados = calcularLados(m.geometria);
    if (lados.length === 0) {
      this.toast.show('No se pudieron calcular las calles de esta manzana', 3000, 'warning');
      return;
    }
    const t = this.salida().get(m.territorio)!;
    if (enteraEnLaBase(t, m.id)) {
      this.avisarYaReportada(m, t);
      return;
    }
    const ed: EdicionLados = {
      manzanaId: m.id,
      nombre: m.nombre,
      territorio: m.territorio,
      color: this.colorDe(m.territorio),
      geometria: m.geometria,
      lados,
      seleccion: ladosElegidos(t, m.id, lados.length),
      bloqueados: ladosDeLaBase(t, m.id, lados.length),
    };
    this.edicion.set(ed);
    this.vista?.mostrarLados(ed, true);
  }

  tocarLado(indice: number): void {
    const ed = this.edicion();
    if (!ed) return;
    if (ed.bloqueados.includes(indice)) {
      this.toast.show('Esa calle ya se reportó. Si fue un error, avisa al administrador.', 3500, 'warning');
      return;
    }
    const seleccion = ed.seleccion.includes(indice)
      ? ed.seleccion.filter(i => i !== indice)
      : [...ed.seleccion, indice].sort((a, b) => a - b);
    const nueva = { ...ed, seleccion };
    this.edicion.set(nueva);
    this.vista?.mostrarLados(nueva);
  }

  /** "Listo": guarda las calles elegidas de la manzana abierta. */
  guardarLados(avisar = true): void {
    const ed = this.edicion();
    const m = ed ? this.manzanasPorId.get(ed.manzanaId) : undefined;
    if (!ed || !m) return;
    this.actualizar(ed.territorio, t => guardarLados(t, m, ed.seleccion, ed.lados.length));
    this.cerrarLados();
    if (!avisar) return;
    if (ed.seleccion.length === 0) this.toast.show(`Manzana ${ed.nombre} sin marcar`, 2000);
    else if (ed.seleccion.length >= ed.lados.length) this.toast.show(`Manzana ${ed.nombre} completa`, 2000, 'success');
    else this.toast.show(`Manzana ${ed.nombre}: ${ed.seleccion.length} de ${ed.lados.length} calles`, 2000, 'success');
  }

  cancelarLados(): void {
    this.cerrarLados();
  }

  todaLaManzana(): void {
    const ed = this.edicion();
    if (!ed) return;
    this.edicion.set({ ...ed, seleccion: ed.lados.map(l => l.indice) });
    this.guardarLados();
  }

  private cerrarLados(): void {
    this.edicion.set(null);
    this.vista?.mostrarLados(null);
  }

  private actualizar(numero: number, cambio: (t: TerritorioSalida) => TerritorioSalida): void {
    this.salida.update(s => {
      const t = s.get(numero);
      return t ? new Map(s).set(numero, cambio(t)) : s;
    });
    if (!this.practica() && !this.inicioSesion() && this.hayCambios()) this.inicioSesion.set(new Date().toISOString());
  }

  // ── Envío ──

  /** Muestra el resumen y pide confirmar antes de enviar. */
  pedirEnvio(): void {
    if (this.enviando()) return;
    if (this.practica()) {
      this.toast.show('Es una práctica: no se envía nada', 2500);
      return;
    }
    if (this.edicion()) this.guardarLados(false);
    const conCambios = this.resumenes().filter(r => r.cambios);
    if (conCambios.length === 0) {
      this.toast.show('No hay cambios para enviar', 2500);
      return;
    }
    if (!this.perfil.currentUser()) {
      this.toast.show('No hay perfil configurado', 3000, 'error');
      return;
    }
    this.pregunta.set({
      titulo: '¿Enviar el reporte?',
      texto: `Turno de la ${this.predicacion()}. Se avisa al grupo por WhatsApp.`,
      detalle: conCambios.map(r => {
        const calles = r.porCalles ? ` y ${r.porCalles} por calles` : '';
        return `Territorio ${r.numero}: ${r.enteras} de ${r.total} manzanas${calles}${r.completo ? ' — ¡completo!' : ''}`;
      }),
      si: 'Enviar',
      no: 'Volver',
      alConfirmar: () => void this.enviar(conCambios),
    });
  }

  responder(si: boolean): void {
    const p = this.pregunta();
    this.pregunta.set(null);
    if (si) p?.alConfirmar();
  }

  /**
   * Guarda y envía. Primero se guarda (si falla, no se envía nada); si el
   * WhatsApp no sale, se borra lo guardado para que no quede un reporte sin
   * aviso al grupo.
   */
  private async enviar(resumenes: ResumenAbierto[]): Promise<void> {
    const perfil = this.perfil.currentUser();
    if (!perfil || this.enviando()) return;
    this.enviando.set(true);
    let guardados: Reporte[] = [];
    let confirmado = false;
    try {
      const envio = envioDe(resumenes);
      const captura = envio.requiereScreenshot ? await this.vista?.capturar(envio.territorios.map(t => t.numero)) ?? null : null;
      const registros = resumenes.map(r => registroDe(this.salida().get(r.numero)!, r.total, perfil, this.inicioSesion()));
      guardados = await this.territorios.crearReportes(registros);
      const ahora = new Date();
      const respuesta = await this.whatsapp.sendReport({
        encargadoNombre: perfil.name,
        encargadoApellido: perfil.lastName,
        fechaRegistro: `${String(ahora.getDate()).padStart(2, '0')}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${ahora.getFullYear()}`,
        predicacion: this.predicacion(),
        territorios: envio.territorios,
        screenshotBase64: captura,
        destinationNumber: perfil.telefono || null,
      });
      if (!respuesta.success) {
        await this.revertir(guardados);
        this.toast.show('No se pudo avisar por WhatsApp: el reporte no se guardó. Tus marcas siguen acá.', 5000, 'error');
        return;
      }
      confirmado = true;
      this.despuesDeEnviar(registros, guardados);
      this.toast.show('Reporte enviado', 4000, 'sent', 'El grupo ya fue avisado por WhatsApp');
    } catch (error) {
      if (guardados.length > 0 && !confirmado) {
        await this.revertir(guardados);
        this.toast.show('No se pudo avisar por WhatsApp: el reporte no se guardó. Tus marcas siguen acá.', 5000, 'error');
      } else if (!confirmado) {
        const caido = error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
        this.toast.show(
          caido ? 'Sin conexión con el servidor. Tus marcas siguen guardadas en el teléfono; intenta de nuevo.' : 'No se pudo guardar el reporte',
          5000,
          'error',
        );
      }
    } finally {
      this.enviando.set(false);
    }
  }

  private async revertir(guardados: Reporte[]): Promise<void> {
    try {
      await this.territorios.eliminarReportes(guardados.map(r => r.id).filter(id => id > 0));
    } catch {
      // Si tampoco se puede borrar, queda guardado sin aviso: el panel lo muestra.
    }
  }

  /** Lo enviado pasa a ser el estado del territorio y se cierra. */
  private despuesDeEnviar(registros: RegistroReporte[], guardados: Reporte[]): void {
    for (const r of guardados) if (r.territorioNumero) this.cacheReportes.setTerritorio(r.territorioNumero, r);
    this.estados.update(estados => {
      const nuevos = new Map(estados);
      for (const r of registros) {
        const previo = estados.get(r.territorioNumero);
        nuevos.set(r.territorioNumero, {
          territorio: r.territorioNumero,
          ultimoTrabajo: r.sessionTime,
          ultimoCompletado: r.estado === 'completed' ? r.sessionTime : previo?.ultimoCompletado ?? null,
          estado: r.estado,
          manzanasMarcadas: r.manzanasMarcadas,
          totalManzanas: r.totalManzanas,
          manzanasIds: r.manzanasIds ?? null,
          geometriaParcial: r.geometriaParcial ?? null,
        });
      }
      return nuevos;
    });
    for (const r of registros) this.quitar(r.territorioNumero);
    this.inicioSesion.set(null);
  }
}

function primerPunto(g: GeometriaManzana): number[] {
  return g.type === 'Polygon' ? g.coordinates[0][0] : g.coordinates[0][0][0];
}
