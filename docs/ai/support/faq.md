# FAQ

## Build & tests
**¿Por qué `mvn verify` no falla aunque haya tests de integración sin correr?**
Porque 4 tests están `@EnabledIfSystemProperty("docker.available")` y `EncargadoRaceConditionIT` no coincide con el include de surefire. ⚠️ Ojo: un `mvn verify` **sin** los IT docker sí puede fallar el gate JaCoCo 40% en `territory-service`. Ver `../testing/integration.md`.

**¿Cómo corro TODOS los tests backend?**
```bash
cd backend && TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true
```
Requiere un Docker socket activo. `TESTCONTAINERS_RYUK_DISABLED=true` hace falta en este entorno (GHCR responde 404 para `testcontainers/ryuk:0.11.0`); CI ya la define.

**¿Un test de repositorio falla con `expected: 101 but was: 8`?**
Es la trampa de `GenerationType.IDENTITY`: la secuencia de la DB avanza entre tests aunque la transacción haga rollback, así que los ids absolutos no son estables. Compara contra el id devuelto por `save()`, nunca contra constantes. Ver `../testing/integration.md`.

**El frontend build muestra "bundle exceeded budget". ¿Es error?**
No. Es warning; CI pasa. Significa 346 kB > 320 kB budget. Ver `../warnings/high.md`.

## Desarrollo
**¿Dónde pongo lógica nueva del mapa?**
Reglas en `features/map/mapa.store.ts`; dibujo en `features/map/mapa-vista.ts`; helpers puros en `features/map/utils/*`. Nunca re-subir geometría al marcar (ADR 0010).

**¿Por qué mi template Angular no compila con `ñ`?**
El lexer de templates de Angular rechaza `ñ` en identifiers. Úsala solo en texto.

**¿Por qué hay 2 implementaciones de validación de teléfono?**
`PhoneUtil.esCelularChileno` (backend) y `core/utils/phone.ts` (frontend) deben estar sincronizadas. Cambiar una obliga a cambiar la otra.

**¿Puedo agregar una migración Flyway en territory?**
**No** por ahora — la DB tiene un `V3__add_s2_dissolved_and_meta` aplicado que no está en el repo, y la validación de Flyway falla al arrancar. Las migraciones de reporting sí corren. Ver `../warnings/critical.md`.

**¿Cómo se cambia el estado de un territorio?**
Nunca borrando reportes. El estado es siempre el último reporte (ADR 0011). Corrección/anulación **agregan** un reporte (`anulado_en` + `reemplaza_a`, ADR 0014).

## Arquitectura
**¿Dónde se definen las rutas del gateway?**
En código: `api-gateway/.../config/RouteConfig.java`. No hay YAML de rutas.

**¿Necesito `SESSION_SECRET` distinto por servicio?**
No — debe ser **idéntico** en gateway, territory y reporting, o los tokens HMAC no verifican.

**¿Cómo levanto observabilidad?**
`docker-compose --profile observability up -d` (otel-collector, jaeger, prometheus, grafana).

## Seguridad
**¿Qué pasa si no configuro secretos fuera de `local`?**
`SessionTokenService` lanza al arrancar si `app.session.secret` < 32 bytes; `ADMIN_PASSWORD_BCRYPT` es obligatorio fuera del perfil `local`.

**¿Se commitea `.env`?**
No. `.env` y `application-local.yml` son gitignored. Copiar desde `.env.example`.
