# CI / CD

Todos los workflows declaran `permissions:` mínimos (sin él, `GITHUB_TOKEN` hereda el default del repo, que puede incluir escritura). Cada workflow incluye además su propio archivo en `pull_request.paths`: sin eso, un PR que solo toca el workflow no lo dispara, y no puedes verificar el cambio.

- `ci-backend.yml`: Java 25 + PostGIS 16 (`predicador_test`); `mvn verify -Pcoverage -B` con `-Ddocker.available=true` y `TERRITORY_IT_DB_*`.
- `ci-frontend.yml`: pnpm 9.15.0 + Node 22; `pnpm install --frozen-lockfile --ignore-scripts`; **`pnpm audit --prod --audit-level=high`** → lint → build → test --coverage. El audit corre antes del lint para que una dependencia vulnerable falle en segundos; `--prod` ignora `devDependencies`, que no viajan al servidor.
- `security.yml`: gitleaks, OWASP dependency-check (fail CVSS=7), Trivy (CRITICAL/HIGH ignore-unfixed), Semgrep (ERROR + SARIF). Semanal Sun 03:00.
- `sonarcloud.yml`: `mapManagerToWeb_predicador-app`; `sonar-project.properties` (lcov + JaCoCo). Corre `mvn verify -Pcoverage -B` con `TERRITORY_IT_DB_*`: **sin esas variables `TerritoryAdminIntegrationTest` se salta y `territory-service` queda en ~25% de líneas contra el gate de 40%**, que es exactamente cómo este workflow estuvo rojo seis corridas seguidas.
- `respaldo-bdd.yml`: diario 07:30 UTC + manual. SSH + `scripts/db/respaldo.sh`. Encriptación `age` con `.github/backup/age.pub`. 90 días.
- `docker.yml`: build & push GHCR (`mapManagerToWeb`). Tag `v*` trigger.
- `opencode.yml`: `opencode/mimo-v2.5-free` (OWNER/MEMBER/COLLABORATOR).

## Compuertas de dependencias en el backend

`backend/pom.xml` ejecuta `maven-enforcer-plugin` en `validate` con una regla `bannedDependencies`. Falla en segundos, antes de compilar, si una dependencia vuelve a una versión con CVE conocido. Un piso por cada pin por CVE de `dependencyManagement`: `amqp-client`, `bcprov-jdk18on`, `guava`, `jackson-databind`/`jackson-core` 2.x, `tools.jackson` databind, `freemarker`, `spring-cloud-config-server` y `httpcore5`/`httpcore5-h2`.

Al añadir un override por CVE, añade también su entrada al Enforcer: el pin en `dependencyManagement` solo vale mientras alguien no lo pise, y el Enforcer es lo que lo hace imposible.

**Un piso que no muerde es peor que ninguno.** `bannedDependencies` solo ve artefactos en compile-scope. `org.postgresql:postgresql` se resuelve en runtime y `tools.jackson.core:jackson-core` no aparece como dependencia directa: se probó subiendo su techo por encima de la versión resuelta y la regla no se disparó, así que se quitaron de la lista. Esos dos los cubren Trivy y OWASP dependency-check. Antes de agregar un piso, comprueba que muerde: sube el techo una versión y exige el `banned via the exclude/include list`.

**Un pin por `dependencyManagement` no basta para Trivy.** El escáner de imágenes analiza el `pom.xml` embebido en el jar (`META-INF/maven/.../pom.xml`), que no lleva `<parent>`, así que no ve los overrides del pom raíz y vuelve a resolver la versión transitiva vulnerable. Caso real: `guava` llegaba a 33.0.0-jre por Eureka Server; el `dependencyManagement` del padre no movió la aguja en Trivy hasta declarar la dependencia **directa y con versión explícita** en `discovery-server/pom.xml`. Eso además la vuelve compile-scope, que es lo que permite custodiarla con el Enforcer.

**Cuidado con el `first_patched_version` de Dependabot**: cita `amqp-client` 5.36.1, que nunca se publicó en Maven Central. El primer release publicado con los tres arreglos es **5.37.0**. Verifica siempre contra `maven-metadata.xml`, no contra el aviso.
