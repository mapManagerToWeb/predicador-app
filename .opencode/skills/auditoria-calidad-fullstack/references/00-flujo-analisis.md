# Flujo de análisis eficiente en tokens

## Fase 0 — Mapa del proyecto (reconocimiento, no razonamiento)

Objetivo: entender la forma del proyecto sin leer todavía código de negocio.

Comandos orientativos (adapta a la herramienta de shell disponible):

````bash
# estructura, ignorando carpetas generadas, profundidad limitada
find . -maxdepth 3 -type d \( -name node_modules -o -name target -o -name dist \
  -o -name build -o -name .git -o -name .angular -o -name coverage \) -prune \
  -o -type d -print

# manifiestos clave
cat pom.xml build.gradle* package.json angular.json 2>/dev/null

# tamaño real del proyecto por tipo de archivo
find . -type f \( -name "*.java" -o -name "*.ts" -o -name "*.html" -o -name "*.scss" \) \
  -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/dist/*" \
  | sed 's/.*\././' | sort | uniq -c

# CI/CD y contenedores
ls -a .github/workflows Dockerfile* docker-compose* 2>/dev/null
````

Anota (para ti, no hace falta volcarlo todo en el informe):

- Versiones declaradas de Java, Spring Boot, Angular, Node.
- Build tool (Maven/Gradle, npm/pnpm/yarn).
- ¿Monorepo o repos separados? ¿Dónde está cada módulo?
- ¿Hay pipeline de CI? ¿Corre tests y análisis estático ahí?
- Tamaño aproximado del proyecto.

No leas todavía archivos de código de negocio.

## Fase 1 — Triage con grep (barato, alto valor)

En vez de abrir archivo por archivo, busca patrones de riesgo en todo el
árbol de una vez. Ejemplos (ajusta a `grep`/`rg` según disponibilidad):

````bash
# Backend
grep -rn "printStackTrace\|System.out.println" --include="*.java" .
grep -rn "catch (Exception" --include="*.java" .
grep -rn "@SuppressWarnings\|TODO\|FIXME\|HACK" --include="*.java" .
grep -rni "password\s*=\|secret\s*=\|api[_-]key" --include="*.yml" --include="*.yaml" --include="*.properties" .
grep -rn "ddl-auto" --include="*.yml" --include="*.properties" .
grep -rn "allowedOrigins(\"\*\")\|@CrossOrigin" --include="*.java" .

# Frontend
grep -rn "console\.log\|debugger" --include="*.ts" src/
grep -rn ": any\b" --include="*.ts" src/
grep -rn "innerHTML\|bypassSecurityTrust" --include="*.ts" src/
grep -rn "\.subscribe(" --include="*.ts" src/ | wc -l
````

Cada coincidencia es un **candidato**, no una conclusión: confírmalo con una
lectura puntual (unas pocas líneas de contexto, no el archivo entero) antes
de reportarlo como hallazgo.

## Fase 2 — Análisis profundo por área

Carga el/los `references/` correspondientes al área que vas a auditar y
profundiza solo en los archivos que Fase 0/1 marcaron como relevantes
(archivos grandes, con coincidencias de grep, o estructuralmente centrales:
`*Application.java`, `*SecurityConfig.java`, `app.config.ts`,
`app.routes.ts`, `environment*.ts`).

Reglas:

- Si necesitas ver un archivo grande, usa un visor con rango de líneas en
  vez de volcarlo entero.
- Agrupa hallazgos similares ("12 controladores exponen entidades JPA
  directamente" en vez de 12 hallazgos casi idénticos).
- Si un mismo hallazgo toca dos áreas (p. ej. secretos en texto plano afecta
  a arquitectura y a seguridad), repórtalo una sola vez en la sección más
  específica y referencia cruzada en la otra.

## Fase 3 — Verificación de versiones y tecnología

Antes de marcar una dependencia, versión o patrón como "obsoleto" o
"deprecado":

1. Compara contra `references/06-radar-tecnologico.md` (línea base a julio
   de 2026).
2. Si tienes una herramienta de búsqueda web disponible, verifica el estado
   actual antes de afirmarlo con seguridad — los ecosistemas de Spring y
   Angular cambian cada ~6 meses.
3. Si no puedes verificar, usa lenguaje de probabilidad ("parece
   desactualizado, confirmar") en vez de una afirmación categórica.
4. Nunca inventes un número de CVE. Si sospechas una vulnerabilidad conocida
   pero no puedes confirmarla, recomienda ejecutar un escáner (OWASP
   Dependency-Check, Trivy, `npm audit`) en vez de nombrarla de memoria.

## Fase 4 — Informe

Usa `references/07-plantilla-informe.md`. Reglas de eficiencia para el
informe:

- Snippets de código solo para hallazgos Crítico/Alto, acotados a las
  líneas relevantes (no el archivo completo).
- Agrupa hallazgos repetidos con su lista de ubicaciones en vez de repetir
  la explicación.
- El roadmap final debe caber en una pantalla: máximo 10 ítems, ordenados
  por impacto/esfuerzo.

## Qué NO hacer

- No leas archivos dentro de `node_modules/`, `target/`, `build/`, `dist/`,
  `.angular/`, `coverage/`, `.git/`, ni binarios.
- No proceses archivos generados (`*.min.js`, specs de OpenAPI generados,
  migraciones históricas ya aplicadas) salvo que te lo pidan.
- No repitas el mismo grep con distinta sintaxis "por si acaso"; una pasada
  dirigida basta.
- No cargues los ocho archivos de `references/` si la auditoría es solo de
  backend o solo de frontend.
