# ADR 0015: Fijar las dependencias transitivas en la version minima corregida

## Status

Accepted

## Context

El workflow `security.yml` ejecuta Trivy sobre las cinco imagenes, y desde al
menos el 30 de septiembre de 2026 fallaba en **todas**, en cada push a `main` y
en la corrida programada. La ultima corrida revisada (4 de octubre) reportaba 57
hallazgos: 9 CVEs distintos y 6 CRITICAL repartidos en cinco artefactos.

| Artefacto | Version publicada | Versiones | CVEs |
|---|---|---|---|
| `org.bouncycastle:bcprov-jdk18on` | 1.84 | 1.85 | CVE-2026-8763 (CRITICAL), CVE-2026-13506 |
| `org.freemarker:freemarker` | 2.3.34 | 2.3.35 | CVE-2026-84939 (CRITICAL, path traversal) |
| `com.fasterxml.jackson.core:jackson-{core,databind}` | 2.21.5 | 2.21.7 | CVE-2026-89407, 89425, 68497, 91776, 91777 |
| `tools.jackson.core:jackson-{core,databind}` | 3.1.5 | 3.1.7 | las mismas cinco |
| `com.rabbitmq:amqp-client` | 5.33.1 | 5.34.0 | CVE-2026-75516 |

Los CVE de Jackson son DoS (crecimiento no acotado de memoria y parseo
cuadratico ante entrada hostil); el de FreeMarker es path traversal; el de
Bouncy Castle es bypass de Name Constraints. No hay RCE, pero todos eran DoS o
de manipulacion de rutas alcanzables desde datos de entrada.

Spring Boot 4.1.1 todavia no gestiona versiones corregidas para ninguno de
ellos, asi que hacen falta pines explicitos en `backend/pom.xml`. Ya existia un
bloque de overrides, pero tenia dos properties muertas: `httpcore5.version` y
`rabbit-amqp-client.version` estaban definidas y **no se consumian en ninguna
parte**. El repositorio aparentaba tener un override de amqp-client que no
existia, y por eso 5.33.1 seguia publicandose.

El escaneo paso factura por dos motivos que no tienen que ver con las versiones:
1. `dependency-check` corre con `continue-on-error: true`, asi que nunca puede
   fallar el build aunque se le pase `-DfailBuildOnCVSS=7`.
2. Trivy si fallaba, pero como lleva semanas rojo de forma permanente dejó de
   leerse como señal. Un check cronicamente rojo es indistinguible del ruido.

## Decision

- Fijar en el `dependencyManagement` de `backend/pom.xml` las cinco
  dependencias, cada una en **la version minima corregida de su misma linea
  menor**, para no introducir upgrades cruzados de minor. Jackson 2.x y
  `tools.jackson` 3.xconviven en Spring Boot 4 y ambos necesitan pin: fijar
  uno solo deja vulnerable al otro.
- Toda property de override debe estar consumida por una entrada real de
  `dependencyManagement`. Se ajoute `amqp-client` a mano, que es lo que
  convierte `rabbit-amqp-client.version` en algo que efectivamente fija.
- Cada pin lleva en comentario el CVE que cierra, para que la proxima revision
  sepa que volver a subir sin motivo.
- Verificar el cambio reconstruyendo las imagenes y volviendo a correr Trivy
  con el mismo criterio del CI. Resolver la dependencia no basta: lo que se
  publica es la imagen.

## Consequences

- Las cinco imagenes quedan en 0 hallazgos HIGH/CRITICAL, verificado
  reconstruyendo y escaneando cada servicio (0 de 57).
- `dependency-check` sigue sin poder fallar el build. Ahora que Trivy esta
  verde, quitarle `continue-on-error` si agrega una senal real, pero conviene
  hacerlo cuando se sepa que la base de datos del NVD esta actualizada; sin
  `NVD_API_KEY` una corrida local tarda horas.
- `PostgisIntegrationTest` y `ReportRepositoryIntegrationTest` fallan de forma
  preexistente y ajena a este cambio (la primera por `app.session.secret` con
  menos de 32 bytes, la segunda por un valor de secuencia `101` vs `8`).
  Ambos se verificaron fallando igual sobre el pom sin tocar. El CI no las ve
  porque `ci-backend.yml` no pasa `-Ddocker.available=true`; hay que Loosear eso
  aparte.