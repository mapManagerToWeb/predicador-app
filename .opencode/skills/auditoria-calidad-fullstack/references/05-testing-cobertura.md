# Testing y cobertura

## Pirámide de tests

Unitarios (rápidos, aislados) en la base, integración (con dependencias
reales vía Testcontainers para BD/colas) en el medio, end-to-end (pocos,
cubriendo solo flujos críticos) en la punta. Una pirámide invertida (muchos
e2e lentos y frágiles, pocos unitarios) es una señal de deuda técnica de
testing que vale la pena señalar aunque el porcentaje de cobertura sea
alto.

## Cobertura: qué medir y qué no

- El porcentaje de líneas cubiertas es una señal, no un objetivo en sí
  mismo. Prioriza cobertura de ramas (branch coverage) en lógica de
  negocio compleja por encima de perseguir un número redondo global.
- Mutation testing (PIT/pitest en el backend Java) es la forma más honesta
  de saber si los tests realmente detectan bugs: un test que "cubre" una
  línea pero no aserta nada relevante deja sobrevivir mutantes.
- Prioriza cobertura en: lógica de negocio crítica, cálculos financieros,
  autenticación/autorización, cualquier código que ya haya causado un
  incidente antes.

## Señales de tests de baja calidad

- Tests sin ninguna aserción real (solo verifican "no lanzó excepción").
- Mocks que verifican implementación interna (qué método se llamó, cuántas
  veces) en vez de comportamiento observable — acoplan el test al detalle
  de implementación y lo rompen ante cualquier refactor, aunque el
  comportamiento siga siendo correcto.
- Tests dependientes del orden de ejecución o del reloj del sistema sin
  control explícito del tiempo (flakiness).
- Tests deshabilitados permanentemente (`@Disabled`, `xit`, `it.skip`) sin
  ticket o justificación asociada.

## Backend (Spring Boot)

- JUnit 5 (Jupiter) como estándar; si queda JUnit 4 sin migrar,
  señálalo como deuda de tooling.
- Testcontainers para pruebas de integración contra una base de datos real
  (en vez de H2 en memoria simulando un motor distinto al de producción,
  que puede ocultar diferencias de comportamiento SQL).
- `@WebMvcTest`/`@DataJpaTest` para tests de capa aislada;
  `@SpringBootTest` completo solo cuando realmente se necesita el contexto
  completo (es más lento).

## Frontend (Angular)

- Vitest (o Karma si el proyecto aún no migró) para unitarios de
  componentes/servicios, con foco en comportamiento visible (qué
  renderiza, qué emite) más que en detalles internos del componente.
- Playwright (estándar actual) o Cypress para e2e de los flujos que de
  verdad importan al negocio — no busques cubrir cada pantalla con e2e, es
  caro de mantener.

## Gates en CI

- Umbral mínimo de cobertura que falle el build si se incumple (no solo un
  reporte informativo que nadie revisa).
- Quality gate de análisis estático (SonarQube u otro) bloqueando el merge
  ante issues nuevos de severidad crítica/bloqueante.
- Umbral de score de mutation testing en los módulos más críticos, si el
  equipo ya lo adoptó.
