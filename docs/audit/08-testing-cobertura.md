# Cobertura y calidad de tests

## Resultados observados

- Frontend: 110 tests pasan, pero la cobertura real reportada es aproximadamente `19.98%` de líneas, `18.95%` de statements, `19.95%` de funciones y `8.87%` de branches frente a umbrales `80/80/80/75` en `vitest.config.ts:28-43`; el comando con cobertura falla por el gate.
- Frontend sin cobertura significativa: login, profile, guards, `EncargadoService`, `MapPage` completo y varios servicios del mapa. No hay E2E para login, autorización, persistencia ni WhatsApp.
- Backend: hay unit tests por módulos, pero no se encontraron `@SpringBootTest`, `@WebMvcTest`, `@DataJpaTest` ni `@Testcontainers`. Territory/reporting usan H2 `create-drop`, distinto de PostgreSQL/PostGIS real.
- `api-gateway`, clientes HTTP, Config Server y Discovery tienen cobertura nula o no demostrada.
- JaCoCo genera reportes pero `backend/pom.xml:87-115` no configura `jacoco:check`; no hay quality gate backend.

## Recomendaciones

Priorizar tests de autenticación/autorización, filtros del gateway, controladores de reportes y el flujo de captura/envío. Añadir Testcontainers con PostgreSQL/PostGIS y convertir JaCoCo/Vitest en gates intencionales: el frontend ya falla por umbral, mientras el backend solo informa.
