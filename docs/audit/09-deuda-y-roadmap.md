# Código muerto, deuda técnica y roadmap

## Deuda técnica

- `RestTemplate` sin timeouts en los clientes WhatsApp.
- `Map` raw y `@SuppressWarnings("unchecked")` en límites externos.
- GeoJSON/WKB procesado manualmente en `TerritoryService`.
- Duplicación de `normalizePhone`, colores y constantes de geometría.
- Directorios frontend vacíos y `.settings/` de Eclipse versionados.
- Node no fijado en `package.json`; ESLint 10 aún recibe `.eslintignore`.
- Frontend coverage below 80% threshold (22.78% statements).

## Roadmap priorizado

| # | Acción | Impacto | Esfuerzo | Estado |
|---:|---|---|---|---|
| 1 | Hacer fail-closed `SESSION_SECRET` y eliminar `admin/admin` | Crítico | S | ✅ Completado |
| 2 | Publicar solo gateway; proteger Config Server, Actuator y observability | Crítico | M | ✅ Completado |
| 3 | Implementar autorización por propietario/rol en reporting | Alto | M | ✅ Completado |
| 4 | Corregir contexto Docker y ejecutar build de imágenes en CI | Alto | S | ✅ Completado |
| 5 | Cambiar `ddl-auto` a `validate` y dejar Flyway como autoridad | Alto | S | Pendiente |
| 6 | Corregir captura con `try/finally` y añadir tests del flujo | Alto | S | ✅ Completado |
| 7 | Añadir paginación, límites y timeouts HTTP externos | Alto | M | Pendiente |
| 8 | Eliminar auth/identidad basada en `localStorage`; evaluar cookies HttpOnly | Alto | L | ✅ Completado |
| 9 | Añadir Testcontainers y quality gates de cobertura backend/frontend | Medio | M | Parcial |
| 10 | Añadir CSP/HSTS, usuario no root y escaneo efectivo de dependencias | Medio | M | ✅ Completado |
