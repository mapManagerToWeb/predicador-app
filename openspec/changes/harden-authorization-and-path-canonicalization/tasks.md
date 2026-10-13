# Tasks: harden-authorization-and-path-canonicalization

> Nota de estado: la implementación de H3/H4/C1 ya existe en el árbol de trabajo (sin commitear). Estas tareas cubren correcciones de documentación, auditoría de la implementación contra las specs, compuertas de verificación, revisión independiente y cierre.

## 1. Corrección de ADR 0016 y Javadoc del canonicalizador

- [x] 1.1 Corregir el Javadoc de `RequestPathCanonicalizer.java` (líneas ~17–27): eliminar la afirmación falsa "eliminan los segmentos `.`"; atribuir `valueToMatch()` a `PathContainer.PathSegment`; añadir que los escapes malformados → `400`. Corregir además el typo "se would decodificar" (línea ~97) → "se decodificaría".
- [x] 1.2 Reescribir el pasaje discutido de `docs/adr/0016-autorizacion-en-servicio-y-canonicalizacion-de-ruta.md` (~líneas 57–75) con solo hechos verificados empíricamente contra spring-web 7.0.9: (a) decode percent por segmento vía `valueToMatch()` — cierto; (b) eliminación de segmentos `.` — FALSO, se preservan como literales; (c) `//` no colapsado — cierto; (d) `..` no resuelto — cierto; (e) corolario 404 — solo para patrones exactos; `/api/**` SÍ coincide con rutas con `..`. Conservar la conclusión de seguridad (normalizar más = negar más = fail-closed), ahora con la divergencia descrita como bidireccional (percent: el enrutador ve más; dots/barras: el enrutador ve menos en patrones exactos).
- [x] 1.3 Verificar por grep que ninguna otra fuente repite la afirmación falsa (patrón `elimina.*segmentos.*\.` en todo el repo) y que el Javadoc corregido ya no la contiene.
  - **Criterio**: grep sin coincidencias de la afirmación falsa; ADR 0016 sin frases que contradigan el script de verificación `spring-verify.jsh` (evidencia empírica conservada).

## 2. Mantenimiento y documentación de deuda

- [x] 2.1 Eliminar la línea 1 de `backend/.dockerignore` (`**/WhatsAppSendListener.java` — clase ya eliminada). Verificar que el archivo sigue ignorando `target/` y que el grep de `WhatsAppSendListener` no da resultados en el árbol.
- [x] 2.2 Marcar `WhatsAppSendRequest.destinationNumber` como `@Deprecated` con Javadoc "no-op: el destino siempre es `whatsapp.destinationNumber`" para que un lector futuro no lo re-conecte (residual LOW).
- [x] 2.3 Registrar en `tasks/security-blocking-fixes.md` (plan de registro): las decisiones de producto H1 (`buscar-crear`) y H6 (IDOR) diferidas, y la deuda de seguimiento de la infra RabbitMQ/compose (muerta pero provisionada) con recomendación de PR separado.
  - **Criterio**: entradas presentes y legibles en el plan de registro; compilación y pruebas no afectadas por 2.2.

## 3. Auditoría de la implementación contra las specs

- [x] 3.1 **Admin-authorization**: verificar por grep que los 29 handlers admin llaman `requireAdmin` como primera instrucción y que `assignColor` (`PUT /api/v1/territories/{n}/color`) está gateado; ejecutar las pruebas de ambos servicios de datos.
- [x] 3.2 **Path-canonicalization**: verificar el cableado del canonicalizador en `SessionAuthFilter` y `ReactiveSessionAuthFilter`, y que el gateway compara contra la ruta decodificada (`getPath()`, no `getRawPath()`); ejecutar `ReactiveSessionAuthFilterTest` (incluye casos `..`) y las pruebas del filtro servlet.
- [x] 3.3 **WhatsApp confinement**: verificar que `ReportSendService` usa siempre `props.destinationNumber()`, que no existe endpoint `.../whatsapp/async` ni listener de cola (grep + compilación), y que `WhatsAppMediaClient` capa a 2 MB antes de decodificar con `413`; ejecutar las pruebas de reporting que tocan el envío.
- [x] 3.4 Cualquier hueco encontrado → escribir primero la prueba que falla (TDD), luego corregir y re-ejecutar.
  - **Criterio**: evidencia de grep + salida de pruebas adjunta para cada sub-tarea; cero desviaciones sin resolver entre implementación y specs.

## 4. Compuertas de verificación

- [x] 4.1 Backend con línea base: ejecutar `mvn verify -Pcoverage -B -Ddocker.available=true` sobre un checkout limpio de `HEAD` para clasificar fallos **preexistentes** (JaCoCo de territory-service ~0.24/0.40 detiene el reactor; `ReportRepositoryIntegrationTest`/`PostgisIntegrationTest`; imagen ryuk retirada aguas arriba rompe pruebas gated por Docker), y luego la misma compuerta sobre el árbol de trabajo.
- [x] 4.2 Clasificar cada fallo del árbol de trabajo como preexistente (reproducible en HEAD limpio) o regresión nueva; documentar con evidencia.
- [x] 4.3 Frontend: `pnpm run lint && pnpm run build && pnpm test -- --run` desde `territory-frontend/`.
  - **Criterio**: toda regresión nueva corregida; los fallos preexistentes documentados con su reproducción en HEAD limpio, sin ocultarlos; frontend en verde.

## 5. Revisión independiente (gate de PASS)

- [x] 5.1 Despachar un reviewer independiente con el diff completo, las specs, el ADR corregido y la evidencia de verificación; exigir `VERDICT: PASS`.
- [x] 5.2 Si el veredicto es FAIL → corregir los hallazgos → re-revisar hasta PASS.
  - **Criterio**: veredicto PASS del reviewer registrado con su evidencia; a diferencia de las rondas previas (canceladas o FAIL por exactitud del ADR), esta ronda concluye con PASS.

## 6. Cierre (sin commitear)

- [x] 6.1 Confirmar vía `openspec status` (o lectura del directorio del change) que las tareas quedan marcadas; el change queda listo para archivar tras la aprobación humana.
- [x] 6.2 Dejar el árbol **sin commits**; presentar al usuario el estado final (informe en español) con: hallazgos corregidos, veredicto de revisión, resultados de compuertas, fallos preexistentes clasificados, y diferidos (H1/H6, RabbitMQ).
  - **Criterio**: `git status --short` muestra el árbol sucio e intencional; el informe final cubre todos los puntos.