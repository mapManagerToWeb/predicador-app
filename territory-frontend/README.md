# Territory

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Deploy en Vercel (SSR)

La app usa SSR (`outputMode: "server"`) y el proxy de `src/server.ts` redirige
`/api/v1/*` al API gateway. Vercel **no** cablea `server.mjs` automáticamente,
por eso hay dos archivos de soporte:

- `api/index.js` — entry point del serverless function que importa el SSR handler.
- `vercel.json` — `rewrites` a `/api` y `includeFiles` para empaquetar `dist/`.

### Variables de entorno (Vercel)

Se configuran en Project Settings → Environment Variables (se leen en runtime):

| Variable | Obligatoria | Valor |
|---|---|---|
| `GATEWAY_URL` | Sí | URL base del gateway, p. ej. `http://146.181.38.193:8080` (sin `/api/v1`) |
| `NG_ALLOWED_HOSTS` | Sí | Dominio(s) de Vercel separados por coma, o `*` para el primer deploy |

Referencia completa: `.env.production.example`.

### Pasos

1. Crear el proyecto en Vercel y conectar el repo (framework preset: Angular).
2. Añadir `GATEWAY_URL` y `NG_ALLOWED_HOSTS` en las variables de entorno.
3. Deployar. Tras el primer deploy, reemplazar `*` en `NG_ALLOWED_HOSTS` por el dominio real.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
