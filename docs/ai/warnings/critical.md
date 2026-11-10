# Advertencias críticas — si se rompen, detienen flujo

| Advertencia | Impacto |
|---|---|
| **No agregar migración territory V3 aún** | Flyway falla en validación de arranque. La DB ya tiene una `V3__add_s2_dissolved_and_meta` aplicada de trabajo no subido. Reporting no se afecta: sus migraciones nuevas sí corren. |
| **Eliminar `maplibre-gl` assets de `angular.json`** | El mapa rompe en runtime (no en build). El worker sale de `import.meta.url` → `/vendor/`. ADR 0010. |
| **Quitar `SESSION_SECRET` idéntico entre servicios** | Los tokens HMAC no verifican entre gateway/territory/reporting → auth falla silenciosamente. |
| **Usar teléfonos no chilenos en crear/editar/login** | Error de validación `telefono_invalido` (espejo client-side en `core/utils/phone.ts`). |
| **Editar una migración territory ya aplicada** | Flyway lo prohíbe; agregar una nueva, nunca reescribir la existente. |
| **Depender de que `EncargadoRaceConditionTest` corra en local** | Solo corre con `-Ddocker.available=true` **y Docker respondiendo**; un `mvn verify` plano lo salta. CI sí lo ejecuta. Antes se llamaba `EncargadoRaceConditionIT` y nunca corría. |
| **DB de test sin nombre `*_test`** | `TerritoryAdminIntegrationTest` borra todas las manzanas; rechaza DB cuyo nombre no termine en `_test`. |
| **6 tests de integración silenciados en local** a menos que `-Ddocker.available=true` y Docker responda (este entorno además necesita `TESTCONTAINERS_RYUK_DISABLED=true`) | Un `mvn verify` local sin la propiedad los reporta skipped; sin los IT, `territory-service` cae bajo el gate JaCoCo 40% y el build falla. CI ya pasa la propiedad. |
| **Añadir imports `features/admin → features/map`** | Queda uno solo (`TERRITORY_COLORS`); un segundo sería deuda de capa. Promover a `core/`. |
| **Ampliar las rutas de `docker-lectura` o devolver 401 en «Sistema»** | HAProxy solo debe permitir `GET /containers/json` y `/containers/<id>/stats` (el inspect filtra contraseñas). Un 401 en `/api/v1/sistema/**` cierra la sesión del panel; los rechazos del pase son **403** con `code` (ADR 0020). |
| **Aumentar el presupuesto de bundle Angular sin optimizar** | Warning de build pero CI pasa; si es crítico, optimizar lazy chunks o quitar features. |
