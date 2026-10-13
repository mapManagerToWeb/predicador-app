# Advertencias — Riesgo medio (fricción de desarrollo)

| Contexto | Gotcha | Solución |
|---|---|---|
| Templates Angular | `ñ` en identifiers (propiedades, bindings) rompe el parser. Solo permitido en texto (`Contraseña`, `Mañana`). | Escribir identifiers en ASCII. |
| `app.config.ts` | Orden de interceptors **es load-bearing**: `[auth, error, csrf]` (csrf innermost, retry de CSRF 403 antes del errorInterceptor). | NO reordenar. |
| `PhoneUtil` (backend) vs `core/utils/phone.ts` (frontend) | `esCelularChileno` debe estar **sincronizado** en ambos lados. | Cambiar uno ⇒ cambiar el otro. |
| `features/admin` → `features/map` | 2 imports cross-feature ya existen (`TERRITORY_COLORS`, zone helpers de `lados`). Un tercero sería deuda de capa. | Promover a `core/`. |
| `api-gateway` | `/api/v1/rum` deliberadamente **sin retry**; abrir el circuito lo degrada. | No agregar retry. |
| `docker-compose.yml` | Orden de arranque: config-server → discovery-server → api-gateway → territory/reporting. | Health checks ya lo enforce; no reordenar servicios. |
| Flyway | `ddl-auto: none`; history tables separadas; nunca editar una migración aplicada. | Nueva migración siempre. |
| Migraciones territory | **No agregar V3 aún** (ver critical). | Esperar a que el V3 unpushed se suba o se reconcilie. |
| `mvn verify -B` sin `-DskipTests` | En docs se usa `-DskipTests` para build rápido; CI usa `-Pcoverage`. | No confundir los dos comandos. |
| Tests de repositorio JPA | Entidades con `GenerationType.IDENTITY`: la secuencia de la DB **avanza entre tests aunque la transacción haga rollback**. Assertar ids absolutos (`101L`) es imposible. | Comparar contra los ids devueltos por `save()`, nunca contra constantes. Ver `../testing/integration.md`. |
| Vitest | `pool: 'threads'` + `isolate` es deliberado (TestBed se rompe con `vmThreads`). | No "simplificar". |
| `pnpm` solo | No usar npm; `pnpm-lock.yaml` es el único lockfile. | `pnpm install --frozen-lockfile`. |