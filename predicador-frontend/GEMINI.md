# GEMINI.md - PredicadorFrontend Project Instructions

Welcome to the **PredicadorFrontend** codebase! This file serves as the definitive reference guide for development patterns, tools, architecture, and deployment procedures in this project. Use these guidelines to maintain consistent and high-quality changes.

---

## 1. Project Overview

**PredicadorFrontend** is a modern, responsive Angular-based web application designed for territory and reporting management. It enables congregation publishers/preachers to view interactive maps, coordinate activities within specific territory blocks (referred to as *manzanas*), log sessions, and report work back to administrators.

### Core Stack
- **Framework:** Angular v22.0.0+ (using modern standalone components, signals, and functional guards).
- **Interactive Maps:** Leaflet (`leaflet`, `@types/leaflet`) for rendering and handling geographic vector/GeoJSON data.
- **State Management:** Angular Signals for local state and reactive notifications (e.g., UI toasts).
- **Asynchronous Data:** RxJS combined with Promise conversions via `firstValueFrom` inside services to simplify async-await workflows.
- **Utilities:** `html2canvas` for visual screenshots/modals of maps.
- **Progressive Web App (PWA):** Equipped with `@angular/service-worker` for offline support and asset caching.
- **Build/Test Runner:** Angular CLI (`@angular/build`), TypeScript v6.0.0+, and Vitest with AnalogJS plugins (`@analogjs/vitest-angular`).

---

## 2. Architecture & File Structure

The project code resides in `src/app/`, partitioned into distinct tiers:

```
src/app/
├── app.config.ts        # App providers (Zone JS coalescing, HttpClient interceptors, PWA worker)
├── app.routes.ts        # Route configuration with functional guards and lazy-loaded features
├── app.ts               # Main root component (standalone)
├── app.html             # Main router-outlet host page
├── app.css              # Global root styles
│
├── core/                # Core singletons and base infrastructure
│   ├── guards/          # Functional routing guards (e.g., admin.guard.ts, profile.guard.ts)
│   ├── interceptors/    # HTTP Interceptors (e.g., error.interceptor.ts)
│   ├── models/          # Shared TypeScript domain models/interfaces (models.ts)
│   └── services/        # Singleton services (e.g., profile.ts, territorio.ts, toast.ts)
│
├── features/            # Feature-specific page components (lazy loaded)
│   ├── admin/           # Admin configuration/dashboard pages
│   ├── map/             # Map visualization component and territory-search
│   ├── profile/         # User/publisher profile manager
│   └── report/          # Session workflow & activity reporting features
│
└── shared/              # Shared UI controls and styling wrappers
    ├── components/      # Common controls (avatar-selector, screenshot-modal, toast)
    └── pipes/           # Application-wide presentation pipes
```

---

## 3. Building and Running

### Development Environment
- Ensure Node.js (v24+) and npm are installed.
- **Install Dependencies:**
  ```bash
  npm install
  ```

### Development Server
Run the local Angular development server:
```bash
npm start
```
*Navigates to `http://localhost:4200/` by default. Changes to local files will trigger browser hot-reload.*

### API Proxy Configuration
To facilitate local integration with a backend server running on port `8080`, the dev-server utilizes a proxy (`proxy.conf.json`):
- All frontend calls to `/api` are redirected to `http://localhost:8080`.
- The environment configuration (`src/environments/environment.ts`) defines `apiUrl` as `/api/v1`.

### Build
Compile and bundle the project for production:
```bash
npm run build
```
*Build files will be generated under the `dist/` directory, optimized with minification, output-hashing, and service worker registration.*

### Watching Development Builds
To run a background build with watch capabilities:
```bash
npm run watch
```

---

## 4. Running Unit Tests

This project has migrated from Karma/Jasmine to **Vitest** for blazing fast unit test execution.

- **Run all tests (Single-run CI mode):**
  ```bash
  npm run test
  ```
- **Run tests in interactive Watch Mode:**
  ```bash
  npm run test:watch
  ```

### Test Setup Details
- Configured in `vitest.config.ts` using `@analogjs/vite-plugin-angular`.
- Uses `jsdom` for browser simulation.
- Setup parameters in `src/test-setup.ts` initialize `TestBed` with `BrowserDynamicTestingModule` and `platformBrowserDynamicTesting`.

---

## 5. Development Conventions & Guidelines

### Standalone Paradigm
- All components must be **standalone** (i.e. `@Component({ standalone: true })` or simply `@Component({ ... })` under Angular 19+ standalone-by-default conventions).
- Include dependencies directly inside the `@Component.imports` array (e.g., `RouterOutlet`, `CommonModule`, child components).

### State & Signals
- Prefer Angular **Signals** (`signal`, `computed`, `effect`) for component internal state, reactive forms or parameters, and shared services status (e.g., see `src/app/core/services/toast.ts` and `profile.ts`).

### Dependency Injection (DI)
- Avoid constructor injection. Use the modern, type-safe `inject(...)` function:
  ```typescript
  import { inject } from '@angular/core';
  import { HttpClient } from '@angular/common/http';

  export class TerritorioService {
    private http = inject(HttpClient);
  }
  ```

### Asynchronous Data & HTTP
- Services calling APIs should return `Promise`s rather than exposing bare Observables to components, unless stream manipulation is required.
- Leverage RxJS `firstValueFrom` to easily convert HTTP observables to promises:
  ```typescript
  async getTerritorio(numero: number): Promise<Territorio> {
    return firstValueFrom(this.http.get<Territorio>(`${this.apiUrl}/${numero}`));
  }
  ```

### Route Guards
- Route guards must be functional. Do not declare class-based guards. Use `CanActivateFn`:
  ```typescript
  export const profileGuard: CanActivateFn = () => {
    const profileService = inject(Profile);
    const router = inject(Router);
    return profileService.hasProfile() ? true : router.navigate(['/profile']);
  };
  ```

### Code Formatting
- Code is formatted automatically using **Prettier**.
- Prettier settings (`.prettierrc`):
  ```json
  {
    "printWidth": 100,
    "singleQuote": true,
    "overrides": [
      {
        "files": "*.html",
        "options": {
          "parser": "angular"
        }
      }
    ]
  }
  ```
- Before pushing changes, format code inline with project settings.
