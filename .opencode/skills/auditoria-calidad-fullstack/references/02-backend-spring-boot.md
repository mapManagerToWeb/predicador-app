# Backend Spring Boot — bugs, rendimiento, código muerto, configuración

## Bugs y code smells comunes

- **NPE latentes**: cadenas de `Optional` mal usadas (`.get()` sin
  `.isPresent()`/`.orElseThrow()`), campos potencialmente null sin chequeo.
- **Recursos no cerrados**: `Stream`, `InputStream`, conexiones manuales sin
  try-with-resources.
- **Excepciones silenciadas**: `catch (Exception e) {}` vacío, o que solo
  hace un log de bajo nivel de algo crítico — oculta fallos reales.
- **Bloqueo dentro de código reactivo**: si el proyecto usa WebFlux,
  llamadas JDBC/bloqueantes dentro de un `Mono`/`Flux` sin
  `subscribeOn(Schedulers.boundedElastic())` bloquean el event loop.
- **`equals()`/`hashCode()` ausentes o mal implementados** en entidades JPA
  usadas dentro de `Set` o como clave de `Map`.
- **Fechas con `java.util.Date`/`Calendar`** en vez de `java.time`
  (inmutable, thread-safe).
- **Concatenación de String en bucles** en vez de `StringBuilder` en rutas
  calientes.

## Rendimiento

- **N+1 queries**: repositorios que disparan una consulta por cada elemento
  de una colección al acceder a una relación lazy dentro de un bucle.
  Busca accesos a relaciones `@OneToMany`/`@ManyToMany` dentro de
  streams/bucles sin `@EntityGraph`, `JOIN FETCH` o proyección DTO.
- **Endpoints de listado sin paginación** (`findAll()` devuelto directo en
  un `List` potencialmente enorme) — usar `Pageable`/`Page<T>`.
- **`FetchType.EAGER` por defecto** en relaciones que no siempre se
  necesitan — carga datos de más en cada consulta.
- **Ausencia de caché** (`@Cacheable`/`@CacheEvict`) en lecturas costosas y
  de baja variabilidad.
- **I/O bloqueante en rutas de alta concurrencia**: candidato a Virtual
  Threads (`spring.threads.virtual.enabled=true`, disponible desde Spring
  Boot 3.2+ sobre Java 21+) en vez de ajustar manualmente pools de hilos
  tradicionales.
- **Falta de compresión HTTP** (`server.compression.enabled=true`) y de
  cache-control adecuado en respuestas estáticas/cacheables.
- **Ausencia de rate limiting** en endpoints públicos sensibles (login,
  búsquedas costosas).

## Código muerto

- Beans/servicios/componentes que no son inyectados en ningún otro lugar
  (buscar con grep el nombre de la clase fuera de su propio archivo).
- Métodos `@Deprecated` que siguen siendo la única implementación llamada
  internamente (la migración quedó a mitad de camino).
- Bloques de código comentados que llevan tiempo así (si hay git, el
  historial puede confirmar antigüedad; si no, trátalo como candidato a
  limpieza).
- Imports/campos no usados, flags de feature permanentemente en un solo
  estado, endpoints de debug/test dejados en el controlador de producción.

## Archivos de configuración

- **Secretos en texto plano** en `application.yml`/`application.properties`
  (contraseñas de BD, API keys, client secrets) — deben venir de variables
  de entorno, un vault o un secret manager, nunca commiteados.
- **`spring.jpa.hibernate.ddl-auto=update` o `create`** fuera de un entorno
  local — en cualquier ambiente compartido o de producción debe ser
  `validate` o `none`, con migraciones versionadas (Flyway o Liquibase)
  como única fuente de verdad del esquema.
- **Actuator expuesto sin protección**:
  `management.endpoints.web.exposure.include: "*"` sin autenticación en un
  perfil de producción expone `/env`, `/beans`, `/heapdump`, etc.
- **CORS permisivo**: `allowedOrigins("*")` combinado con
  `allowCredentials(true)` es una combinación insegura (y de hecho el
  navegador la rechaza — señal de que la configuración no se pensó bien);
  debe haber una lista explícita de orígenes permitidos por entorno.
- **Perfiles inconsistentes**: verificar que `application-dev`,
  `application-staging` y `application-prod` no diverjan en
  configuraciones críticas de seguridad (p. ej. CSRF desactivado "solo en
  dev" que terminó también desactivado en prod).
- **`server.error.include-stacktrace: always`** o mensajes de error
  detallados expuestos al cliente en producción — fuga de información
  interna.
- **Logging de datos sensibles**: tokens, contraseñas, PII impresos en
  logs a nivel INFO/DEBUG.

## Huecos de cobertura

- Clases de servicio/controlador sin clase de test asociada (comparar
  `src/main/java` vs `src/test/java` por convención de nombres).
- Rutas críticas (pagos, autenticación, cualquier cosa que mueva dinero o
  datos personales) con cobertura baja o nula — máxima prioridad de
  remediación, por encima de subir el porcentaje global.
- Tests que existen pero no aseveran nada significativo (solo verifican que
  no lance excepción) — si hay mutation testing disponible (PIT), úsalo
  para detectar tests "de relleno" que no matan mutantes.
