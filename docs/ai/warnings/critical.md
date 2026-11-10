# Advertencias críticas — si se rompen, detienen flujo

| Advertencia | Impacto |
|---|---|
| **No agregar migración territory V3 aún** | Flyway falla en validación startup. DB ya tiene V3__add_s2_dissolved_and_meta de trabajo no subido. Reportes unaffected: nuevas migraciones sí corren. |
| **Eliminar `maplibre-gl` assets de `angular.json`** | Mapa rompe en runtime (no build-time). Worker desde `import.meta.url` → `/vendor/`. ADR 0010. |
| **Quitar `SESSION_SECRET` idéntico entre servicios** | Tokens HMAC no verifican entre gateway/territory/reporting → auth falla silenciosamente. |
| **Usar telefonos no chilenos en crear/edit/login** | `telefono_invalido` error de validación (mirror client-side en `core/utils/phone.ts`). |
| **Editar migración territory ya aplicada** | Flyway prohíbe; hay que agregar una nueva migration, nunca reescribir la existente. |
| **Depender de que `EncargadoRaceConditionTest` corra en local** | Solo corre con `-Ddocker.available=true`; un `mvn verify` plano lo salta. CI sí lo ejecuta. Antes se llamaba `EncargadoRaceConditionIT` y nunca corría. |
| **DB test sin nombre `*_test`** | `TerritoryAdminIntegrationTest` borra todas las manzanas; rechaza DB que no terminen en `_test`. |
| **5 tests de integración silenciados en local a menos que `-Ddocker.available=true`** (este entorno además necesita `TESTCONTAINERS_RYUK_DISABLED=true`) | Un `mvn verify` local sin la propiedad reporta skipped; sin los IT, `territory-service` cae bajo el gate JaCoCo 40% y el build falla. CI ya pasa la propiedad. Necesitas Docker socket activo. |
| **Depender de que `features/admin → features/map` imports** (más de 2) | 2 imports existentes (TERRITORY_COLORS, zone helpers); un tercero sería deuda de capa. Promover a `core/`. |
| **Aumentar presupuesto de bundle Angular sin optimizar** | Warning build pero CI pasa; si crítico, optimizar lazy chunks o remover features. |