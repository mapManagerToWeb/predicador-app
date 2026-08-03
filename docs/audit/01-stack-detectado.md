# Stack detectado

| Componente | Versión encontrada | Estado según radar jul. 2026 |
|---|---|---|
| Java | 21 | LTS vigente; evaluar Java 25 cuando el ciclo lo permita |
| Spring Boot | 4.0.0 | Serie soportada y actual |
| Spring Cloud | 2025.1.0 | Actual |
| Angular | 22.x | Última estable |
| Node.js | 22 en CI | En mantenimiento; Node 24 es la línea recomendada |
| TypeScript | 6.0.2 | Actual con Angular 22 |
| Vitest | 4.1.10 | Actual |
| ESLint | 10.8.0 | Actual; requiere flat config |
| PostgreSQL/PostGIS | `postgis/postgis:16-3.4` en CI | Actual |
| OpenTelemetry | 1.64.0 / instrumentation 2.30.0 | Actual |
| JaCoCo | 0.8.12 | Actual |

El frontend usa el builder moderno `@angular/build:application`, standalone components, lazy routes y Vitest. No hay evidencia de Karma ni de Angular obsoleto. El `package.json` no declara `engines`; conviene fijar la versión de Node compatible.
