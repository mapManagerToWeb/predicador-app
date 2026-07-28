# Arquitectura y Patrones de Diseño - Predicador Frontend

## 📋 Análisis de Arquitectura Actual

El proyecto implementa una arquitectura **feature-based** con componentes standalone y servicios singleton, basada en Angular 22 con Vite/Analog. Esta es una buena base, pero hay oportunidades significativas de mejora en organización, mantenibilidad y escalabilidad.

---

## ✅ Fortalezas Actuales

| Aspecto | Implementación | Beneficio |
|--------|-----------------|----------|
| **Componentes Standalone** | Sin NgModule, lazy-loading directo | Menor bundle size, carga más rápida |
| **Separación de Responsabilidades** | `core/`, `features/`, `shared/` | Código organizado y mantenible |
| **Servicios Singleton** | `providedIn: 'root'` | Instancia única en toda la app |
| **Type Safety** | TypeScript strict, sin `any` | Menos errores en runtime |
| **State Management** | Signals de Angular | Reactividad eficiente |
| **Caching Strategy** | Maps locales en servicios | Menos requests HTTP |
| **Guards Protección** | `profileGuard` en rutas privadas | Seguridad de autenticación |

---

## 🚩 Problemas Identificados

### 1. **Falta de Patrón de Estado Centralizado**
- Cada servicio maneja su propio estado (Profile, TerritorioService, Toast)
- Difícil de sincronizar cambios entre componentes
- Complejo debuggear en aplicaciones grandes

**Impacto:** Medium. Funciona pero difícil de rastrear cambios globales.

### 2. **Lógica de Negocio Mezclada en Componentes**
- `map.ts` tiene ~1000+ líneas
- Funciones utilitarias (`elegirUltimoReporte`, `getTerritoryFillOpacity`) fuera de servicios
- Manejo de eventos de mapa acoplado al componente

**Impacto:** HIGH. Componentes difíciles de testear y mantener.

### 3. **Servicios sin Interfaz Abstracta**
- Difícil cambiar implementaciones o mockear en tests
- Acoplamiento fuerte a implementaciones concretas

**Impacto:** Medium. Testabilidad reducida.

### 4. **Falta de DTOs/Mappers**
- Modelos directos desde API sin transformación
- Si el backend cambia, se rompe toda la app

**Impacto:** High. Cambios backend = refactor frontend.

### 5. **Gestión de Caché Inconsistente**
- Cada servicio usa `Map<>` manualmente
- Invalidación manual y propensa a errores
- Sin estrategia de TTL (time-to-live)

**Impacto:** Medium. Memory leaks potenciales.

### 6. **Error Handling Incompleto**
- Catch bloques genéricos
- Sin diferenciación entre tipos de error
- Sin retry logic

**Impacto:** Medium. Mala UX en fallos.

### 7. **Falta de Inyección de Dependencias para Adaptadores**
- Difícil cambiar API endpoints, localStorage, etc.
- Testabilidad reducida

**Impacto:** Low-Medium. Funciona pero no es escalable.

---

## 🎯 Recomendaciones de Arquitectura

### **1. NGRX/Redux-like State Management**
Para centralizar estado y hacer debugging más fácil:

```
src/app/
├── core/
│   ├── state/
│   │   ├── store/
│   │   │   ├── app.store.ts (señal global)
│   │   │   └── entities/ (Territorio, Reporte, etc.)
│   │   ├── actions/
│   │   │   ├── profile.actions.ts
│   │   │   ├── territorio.actions.ts
│   │   │   └── reporte.actions.ts
│   │   └── selectors/
│   │       ├── profile.selectors.ts
│   │       └── territorio.selectors.ts
```

**Ventaja:** Debugging predecible, estado centralizado, fácil de testear.

---

### **2. Clean Architecture Layers**
Separar por capas de responsabilidad:

```
src/app/
├── core/
│   ├── domain/ (Lógica de negocio pura)
│   │   ├── entities/
│   │   │   ├── territorio.entity.ts
│   │   │   ├── reporte.entity.ts
│   │   │   └── user.entity.ts
│   │   ├── repositories/ (Interfaces abstractas)
│   │   │   ├── territorio.repository.ts
│   │   │   ├── reporte.repository.ts
│   │   │   └── auth.repository.ts
│   │   └── use-cases/ (Casos de uso)
│   │       ├── mark-manzana.usecase.ts
│   │       ├── create-reporte.usecase.ts
│   │       └── login.usecase.ts
│   ├── data/ (Implementaciones)
│   │   ├── repositories/
│   │   │   ├── territorio.repository.impl.ts
│   │   │   └── ...
│   │   ├── datasources/
│   │   │   ├── territorio.datasource.ts
│   │   │   └── local.datasource.ts
│   │   └── models/
│   │       └── api-models/ (DTOs)
│   └── presentation/
│       ├── services/ (Servicios de presentación)
│       ├── state/ (Signals, estado local)
│       └── adapters/ (Adaptadores UI)
```

**Ventaja:** Lógica independiente del framework, testeable sin Angular.

---

### **3. Repository Pattern con Adaptadores**
Para abstraer fuentes de datos:

```typescript
// domain/repositories/territorio.repository.ts
export abstract class TerritorioRepository {
  abstract getTerritorios(): Promise<Territorio[]>;
  abstract getGeoJson(): Promise<GeoJSON.FeatureCollection>;
  abstract saveReporte(reporte: RegistroReporte): Promise<Reporte>;
}

// data/repositories/territorio.repository.impl.ts
@Injectable({ providedIn: 'root' })
export class TerritorioRepositoryImpl extends TerritorioRepository {
  constructor(
    private http: HttpClient,
    private cache: CacheService
  ) { super(); }
  
  async getGeoJson() {
    return this.cache.getOrFetch(
      'territorios_geojson',
      () => this.http.get<string>('...')
    );
  }
}
```

**Ventaja:** Fácil cambiar backend, implementar caché consistente, testear sin HTTP.

---

### **4. Use Cases / Services de Aplicación**
Para orquestar operaciones complejas:

```typescript
// domain/use-cases/send-whatsapp-report.usecase.ts
export class SendWhatsAppReportUseCase {
  constructor(
    private territorioRepo: TerritorioRepository,
    private reporteRepo: ReporteRepository,
    private whatsappAdapter: WhatsAppAdapter
  ) {}

  async execute(input: SendReportInput): Promise<SendReportOutput> {
    const reportes = await this.reporteRepo.create(input.registros);
    const territorios = this.buildTerritoriosEnvio(reportes);
    const response = await this.whatsappAdapter.send({
      territorios,
      screenshot: input.screenshot
    });
    return { success: response.success, messageId: response.messageId };
  }
}
```

**Ventaja:** Lógica de negocio reutilizable, testeable sin UI.

---

### **5. Adaptadores para Servicios Externos**
Interfaces abstractas para integración:

```
core/adapters/
├── storage.adapter.ts (localStorage, sessionStorage)
├── cache.adapter.ts (estrategia de caché)
├── logger.adapter.ts (logging)
├── notification.adapter.ts (Toast)
└── whatsapp.adapter.ts (envío de mensajes)
```

```typescript
// Interfaz
export abstract class StorageAdapter {
  abstract get(key: string): any;
  abstract set(key: string, value: any): void;
  abstract remove(key: string): void;
}

// Implementación
@Injectable({ providedIn: 'root' })
export class LocalStorageAdapter extends StorageAdapter {
  get(key: string) { return localStorage.getItem(key); }
  set(key: string, value: any) { localStorage.setItem(key, JSON.stringify(value)); }
  remove(key: string) { localStorage.removeItem(key); }
}

// Mock para tests
export class MockStorageAdapter extends StorageAdapter {
  private data = new Map<string, any>();
  get(key: string) { return this.data.get(key); }
  set(key: string, value: any) { this.data.set(key, value); }
  remove(key: string) { this.data.delete(key); }
}
```

**Ventaja:** Fácil testear, cambiar storage backend, usar diferentes estrategias.

---

### **6. DTO Mappers / Data Transformers**
Transformar API responses a entidades de dominio:

```
data/mappers/
├── territorio.mapper.ts
├── reporte.mapper.ts
└── user.mapper.ts
```

```typescript
// data/mappers/territorio.mapper.ts
export class TerritorioMapper {
  static toDomain(dto: TerritorioDto): Territorio {
    return {
      id: dto.id,
      numero: dto.numero,
      manzanas: dto.manzanas.map(m => ({
        id: m.id,
        nombre: m.bloque_nombre,
        // ... transformar según reglas de negocio
      }))
    };
  }

  static toPersistence(entity: Territorio): TerritorioDto {
    return {
      id: entity.id,
      numero: entity.numero,
      // ... transformación inversa
    };
  }
}
```

**Ventaja:** Desacoplamiento API-Dominio, cambios backend sin afectar lógica.

---

### **7. Extracción de Lógica de Componentes Grandes**
Dividir `MapPage` (~1000 líneas):

```
features/map/
├── map.ts (contenedor, <200 líneas)
├── services/
│   ├── map-interaction.service.ts (manejo de clics/eventos)
│   ├── map-rendering.service.ts (Leaflet rendering)
│   ├── map-state.service.ts (Signals para estado local)
│   └── map-selection.service.ts (lógica de selección)
├── utils/
│   ├── map-geometry.ts (ya existe)
│   ├── territory-colors.ts (paleta de colores)
│   └── map-constants.ts (constantes)
├── components/
│   ├── territory-search/ (ya existe)
│   ├── map-legend/ (nueva)
│   └── map-toolbar/ (nueva)
└── types/
    └── map.types.ts (interfaces locales)
```

**Ventaja:** Componentes + servicios más pequeños, reutilización, testabilidad.

---

## 🏗️ Estructura Propuesta (Versión Escalable)

```
src/app/
├── core/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── territorio.entity.ts
│   │   │   ├── reporte.entity.ts
│   │   │   ├── user.entity.ts
│   │   │   └── types/ (Enums y tipos de dominio)
│   │   ├── repositories/
│   │   │   ├── territorio.repository.ts (interfaz)
│   │   │   ├── reporte.repository.ts
│   │   │   └── auth.repository.ts
│   │   └── use-cases/
│   │       ├── login.usecase.ts
│   │       ├── mark-manzana.usecase.ts
│   │       ├── create-reporte.usecase.ts
│   │       └── send-whatsapp.usecase.ts
│   ├── data/
│   │   ├── repositories/
│   │   │   ├── territorio.repository.impl.ts
│   │   │   ├── reporte.repository.impl.ts
│   │   │   └── auth.repository.impl.ts
│   │   ├── datasources/
│   │   │   ├── territorio.datasource.ts (HTTP)
│   │   │   ├── local.datasource.ts (Storage)
│   │   │   └── cache.datasource.ts (Caché)
│   │   ├── mappers/
│   │   │   ├── territorio.mapper.ts
│   │   │   └── reporte.mapper.ts
│   │   └── models/
│   │       ├── api-models/ (DTOs desde backend)
│   │       └── local-models/ (Modelos locales)
│   ├── presentation/
│   │   ├── services/
│   │   │   ├── profile.service.ts (façade del Profile)
│   │   │   ├── territorio-facade.service.ts
│   │   │   └── reporte-facade.service.ts
│   │   ├── state/
│   │   │   ├── app.store.ts (estado global Signals)
│   │   │   ├── selectors/ (computed signals)
│   │   │   └── effects/ (subscripciones)
│   │   └── pipes/ (transformaciones UI)
│   ├── adapters/
│   │   ├── storage.adapter.ts
│   │   ├── cache.adapter.ts
│   │   ├── http.adapter.ts
│   │   ├── logger.adapter.ts
│   │   └── notification.adapter.ts
│   ├── guards/
│   │   └── profile.guard.ts
│   ├── interceptors/
│   │   └── error.interceptor.ts
│   ├── config/
│   │   └── injection-tokens.ts
│   └── utils/
│       ├── phone.ts
│       ├── cache-utils.ts
│       └── error-handler.ts
├── features/
│   ├── auth/
│   │   ├── login/
│   │   │   ├── login.ts
│   │   │   └── ...
│   │   └── services/ (login.service.ts)
│   ├── map/
│   │   ├── map.ts (contenedor principal)
│   │   ├── services/
│   │   │   ├── map-interaction.service.ts
│   │   │   ├── map-rendering.service.ts
│   │   │   ├── map-state.service.ts
│   │   │   └── map-selection.service.ts
│   │   ├── components/
│   │   │   ├── territory-search/
│   │   │   ├── map-legend/
│   │   │   └── map-toolbar/
│   │   ├── types/
│   │   │   └── map.types.ts
│   │   └── utils/
│   │       ├── map-geometry.ts
│   │       ├── territory-colors.ts
│   │       └── map-constants.ts
│   ├── profile/
│   │   └── profile.ts
│   └── admin/
│       └── admin.ts
└── shared/
    ├── components/
    │   ├── avatar-selector/
    │   ├── screenshot-modal/
    │   └── toast/
    ├── pipes/
    ├── directives/
    ├── models/ (tipos compartidos)
    └── utils/
```

---

## 🔄 Patrones de Diseño Recomendados

### **1. Mediator Pattern (para componentes complejos)**
```typescript
// features/map/map-mediator.service.ts
@Injectable()
export class MapMediator {
  constructor(
    private renderingService: MapRenderingService,
    private interactionService: MapInteractionService,
    private state: MapStateService
  ) {
    this.setupCoordination();
  }

  private setupCoordination() {
    this.interactionService.onManzanaClicked.pipe(
      tap(manzana => this.renderingService.highlight(manzana)),
      tap(manzana => this.state.selectManzana(manzana))
    ).subscribe();
  }
}
```

**Uso:** Componentes grandes con múltiples servicios que necesitan coordinación.

---

### **2. Strategy Pattern (para algoritmos intercambiables)**
```typescript
// domain/entities/caching-strategies/
export interface CacheStrategy {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttl?: number): void;
  invalidate(key: string): void;
}

// Implementaciones
export class MemoryCacheStrategy implements CacheStrategy { ... }
export class LocalStorageCacheStrategy implements CacheStrategy { ... }
export class IndexedDBCacheStrategy implements CacheStrategy { ... }
```

**Uso:** Diferentes estrategias de caché sin cambiar código cliente.

---

### **3. Observer Pattern (ya usado implícitamente)**
```typescript
// Mejorar con RxJS subjects tipados
@Injectable()
export class MapInteractionService {
  private manzanaClickedSubject = new Subject<ManzanaClickedEvent>();
  public manzanaClicked$ = this.manzanaClickedSubject.asObservable();

  notifyManzanaClicked(manzana: Manzana) {
    this.manzanaClickedSubject.next({ manzana, timestamp: Date.now() });
  }
}
```

**Uso:** Comunicación entre componentes desacoplada.

---

### **4. Builder Pattern (para objetos complejos)**
```typescript
// domain/builders/
export class ReporteBuilder {
  private reporte: Partial<Reporte> = {};

  withTerritorio(numero: number) {
    this.reporte.territorioNumero = numero;
    return this;
  }

  withManzanas(marcadas: number, total: number) {
    this.reporte.manzanasMarcadas = marcadas;
    this.reporte.totalManzanas = total;
    return this;
  }

  build(): Reporte {
    if (!this.validate()) throw new Error('Reporte inválido');
    return this.reporte as Reporte;
  }
}

// Uso
const reporte = new ReporteBuilder()
  .withTerritorio(1)
  .withManzanas(5, 10)
  .build();
```

**Uso:** Crear objetos complejos paso a paso, validación progresiva.

---

### **5. Decorator Pattern (para logging, timing)**
```typescript
// core/decorators/
export function LogExecution() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      console.time(propertyKey);
      try {
        const result = await originalMethod.apply(this, args);
        console.log(`✓ ${propertyKey} completed`);
        return result;
      } finally {
        console.timeEnd(propertyKey);
      }
    };
    return descriptor;
  };
}

// Uso
@Injectable()
export class TerritorioRepositoryImpl {
  @LogExecution()
  async getGeoJson() { ... }
}
```

**Uso:** Mejorar métodos sin modificar su lógica principal.

---

### **6. Facade Pattern (ya parcialmente usado)**
```typescript
// core/presentation/services/territorio-facade.service.ts
@Injectable({ providedIn: 'root' })
export class TerritorioFacade {
  territorios$ = this.store.select(selectTerritorios);
  loading$ = this.store.select(selectLoading);

  constructor(
    private territorioUseCase: GetTerritoriosUseCase,
    private store: AppStore
  ) {}

  loadTerritorios() {
    this.store.setLoading(true);
    this.territorioUseCase.execute().then(
      datos => this.store.setTerritorios(datos),
      error => this.store.setError(error)
    );
  }
}

// Componente solo usa facade
export class SomeComponent {
  territorios$ = this.facade.territorios$;
  
  constructor(private facade: TerritorioFacade) {}
}
```

**Uso:** Simplificar interacción entre componentes y servicios complejos.

---

## 📊 Comparación: Antes vs Después

| Aspecto | Antes | Después |
|--------|-------|---------|
| **Tamaño de Componentes** | 1000+ líneas | 200-300 líneas |
| **Testabilidad** | Difícil sin Angular | Fácil, lógica pura testeable |
| **Cambios Backend** | Refactor cascada | Mapper abstrae cambios |
| **Gestión de Estado** | Dispersa en servicios | Centralizada y debuggeable |
| **Reutilización** | Limitada a servicios | Use cases reutilizables |
| **Escalabilidad** | Difícil agregar features | Fácil seguir patrón |
| **Cobertura de Tests** | ~30% | ~80%+ |

---

## 🚀 Plan de Implementación (Iterativo)

### **Fase 1: Foundation (2-3 sprints)**
- [ ] Crear estructura de carpetas `domain/`, `data/`, `presentation/`
- [ ] Extraer interfaces de repositorios
- [ ] Implementar DTO Mappers para Territorio y Reporte
- [ ] Crear StorageAdapter y CacheAdapter

### **Fase 2: Use Cases (2 sprints)**
- [ ] Implementar primeros use cases: LoginUseCase, GetTerritoriosUseCase
- [ ] Tests de use cases sin dependencias de Angular
- [ ] Integración con repositorios

### **Fase 3: State Management (2 sprints)**
- [ ] Implementar AppStore con Signals
- [ ] Migraciones de estado disperso → centralizado
- [ ] Selectors computed

### **Fase 4: Refactor de Componentes (3 sprints)**
- [ ] Dividir MapPage → MapComponent + Servicios
- [ ] Extraer lógica de LoginPage
- [ ] Mejorar AdminPage

### **Fase 5: Testing & Polish (2 sprints)**
- [ ] Tests de servicios, use cases, mappers
- [ ] Documentación actualizada
- [ ] Performance review

---

## 📚 Recursos y Referencias

- **Domain-Driven Design (DDD):** https://en.wikipedia.org/wiki/Domain-driven_design
- **Clean Architecture (Robert C. Martin):** Uncle Bob's principles
- **Angular Style Guide:** https://angular.dev/style-guide
- **Repository Pattern:** https://www.martinfowler.com/eaaCatalog/repository.html
- **Mediator Pattern:** https://refactoring.guru/design-patterns/mediator

---

## ✅ Checklist de Implementación

- [ ] Revisar esta arquitectura con el equipo
- [ ] Crear issues con tareas de refactor
- [ ] Priorizar fases según roadmap
- [ ] Documentar decisiones en ADR (Architecture Decision Records)
- [ ] Setup linting rules para asegurar patrón se siga

---

**Esta es una recomendación basada en análisis del proyecto actual. Se puede adaptar según necesidades específicas o limitaciones del proyecto.**
