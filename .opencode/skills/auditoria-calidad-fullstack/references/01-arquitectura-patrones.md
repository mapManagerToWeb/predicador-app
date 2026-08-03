# Arquitectura y patrones de diseño

Objetivo: que el proyecto sea mantenible, testeable y escalable — no
"perfecto" ni sobre-diseñado. Ajusta el rigor a la complejidad real del
proyecto (evita recomendar Hexagonal/DDD completo para un CRUD de 10
endpoints).

## Backend (Spring Boot)

### Separación de capas

- Controlador → Servicio → Repositorio, sin saltarse capas (el controlador
  no debe usar `EntityManager`/repositorio directamente).
- El controlador no debe contener lógica de negocio, solo orquestación y
  mapeo HTTP.
- Las entidades JPA no deberían salir de la capa de persistencia: usa DTOs
  o records + mapper (MapStruct o manual) en la respuesta de la API.
  Exponer entidades directamente acopla el contrato HTTP al modelo de datos
  y filtra relaciones lazy no deseadas.

### Organización de paquetes

- "Package by feature" (por dominio: `orders`, `customers`, `billing`)
  suele escalar mejor que "package by layer" (`controllers`, `services`,
  `repositories`) en proyectos medianos/grandes, al agrupar por cohesión de
  negocio en vez de técnica.
- Señal de alerta: paquetes genéricos (`utils`, `helpers`, `common`) que
  crecen sin límite — suelen esconder falta de cohesión.

### Dirección de dependencias

- El dominio (reglas de negocio) no debería importar frameworks de
  infraestructura (JPA, clientes HTTP, colas). Si el paquete de dominio
  importa clases de infraestructura, es una señal de acoplamiento a
  visibilizar (no siempre grave, pero conviene señalarlo).
- ArchUnit permite convertir estas reglas en tests automáticos:
  `noClasses().that().resideInAPackage("..domain..").should().dependOnClassesThat().resideInAPackage("..infrastructure..")`,
  más una regla anti-ciclos entre paquetes.

### Anti-patrones a detectar

- **God class/service**: clases de más de ~400-500 líneas o con más de 15
  métodos públicos y responsabilidades mezcladas.
- **Modelo anémico llevado al extremo** cuando hay lógica de negocio real:
  entidades que son solo getters/setters mientras toda la lógica vive en
  "Service" gigantes — evalúa mover comportamiento a la entidad/agregado
  cuando tenga sentido de dominio.
- **Transaccionalidad mal ubicada**: `@Transactional` en toda la clase o en
  el controlador; auto-invocación de métodos `@Transactional` dentro de la
  misma clase (el proxy de Spring no lo intercepta, la transacción no
  aplica realmente).
- **Manejo de errores disperso**: cada controlador con su propio
  try/catch en vez de un `@RestControllerAdvice` centralizado con un
  contrato de error consistente (Spring 6+ soporta `ProblemDetail` /
  RFC 7807 de forma nativa).
- **Validación manual repetida** en vez de Bean Validation
  (`jakarta.validation`) en el DTO de entrada.
- **Dependencias creadas con `new`** en vez de inyectadas — dificulta
  testear con mocks.
- **Singletons con estado mutable compartido** (campos de instancia
  mutables en un `@Service`, que por defecto es singleton) — riesgo de
  condiciones de carrera.

## Frontend (Angular)

### Separación de responsabilidades

- Componentes "smart" (contenedores, hablan con servicios/estado) vs
  "dumb" (presentación, solo `input()`/`output()` o `@Input`/`@Output`).
- Señal de alerta: un componente que hace llamadas HTTP directamente,
  contiene lógica de negocio Y maneja el template — extraer a un
  servicio/facade.

### Estado

- Estado local de componente → Signals (`signal()`, `computed()`,
  `linkedSignal()`).
- Estado async → `resource()`/`httpResource()`, o RxJS con `async` pipe;
  evita `subscribe()` manual sin gestión de ciclo de vida.
- Estado compartido entre features → evalúa primero un store ligero basado
  en signals antes de introducir NgRx u otra librería pesada; NgRx se
  justifica cuando hay mucho estado compartido, historial/undo, o
  necesidad de time-travel debugging, no como opción por defecto.

### Servicios e inyección de dependencias

- Servicios con responsabilidad única (un servicio de HTTP por
  recurso/dominio, no un `ApiService` gigante con decenas de métodos).
- `inject()` como alternativa moderna a la inyección por constructor
  cuando mejora la legibilidad (composición de funciones, `providers` en
  rutas).
- `providedIn: 'root'` (o el decorador `@Service()` en proyectos ya en
  Angular 22+) para singletons, en vez de registrar en cada módulo.

### Componentes y plantillas

- Standalone components como default; si el proyecto sigue usando
  NgModules por completo, es señal de que conviene planificar la
  migración progresiva.
- Sintaxis de control de flujo moderna (`@if`, `@for` con `track`,
  `@switch`) en vez de `*ngIf`/`*ngFor` — mejor rendimiento y sin necesidad
  de `CommonModule` para estas directivas.
- `@for` **siempre** con `track` (o `trackBy` en la sintaxis clásica) — sin
  esto, Angular puede destruir/recrear nodos DOM innecesariamente en cada
  cambio, afectando el rendimiento en listas.
- Rutas con carga perezosa (`loadComponent`/`loadChildren`) por feature;
  guards como funciones (`CanActivateFn`) en vez de clases legacy.

### Anti-patrones a detectar

- Componente "God component" que centraliza rutas, llamadas HTTP,
  formularios y lógica de UI a la vez.
- Duplicación de plantillas/lógica entre componentes similares en vez de
  composición (content projection, directivas reutilizables, componentes
  de UI compartidos).
- Mutación directa de un `@Input()`/`input()` recibido (rompe el flujo de
  datos unidireccional).
- Uso de `any` como escape sistemático del sistema de tipos, en particular
  en los límites con el backend (usa interfaces/tipos compartidos desde el
  contrato de la API en vez de tipar "a mano" de forma laxa).
