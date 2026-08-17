/// <reference types="vitest/globals" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  // Evita que Vite escanee artefactos de producción (dist/) como si fueran
  // fuentes. Sin esto, el dep-scanner intenta resolver los chunks del SSR
  // build y emite un warning ruidoso al correr `vitest run`.
  optimizeDeps: {
    entries: ['src/**/*.{ts,html}'],
  },
  server: {
    fs: {
      // Solo permitir leer desde el workspace, no desde dist/.
      strict: true,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // `@analogjs/vite-plugin-angular` defaults to the `vmThreads` pool, where
    // `isolate` has no effect (https://vitest.dev/config/isolate). On small
    // runners (e.g. CI) spec files then share a worker and Angular's global
    // TestBed state bleeds across files, throwing "Cannot configure the test
    // module when the test module has already been instantiated". The
    // `threads` pool honours `isolate: true` and resets per-file state.
    pool: 'threads',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['src/test-setup.ts'],
    // Coverage con V8 (nativo del runtime, sin instrumentation). Umbrales
    // elevados tras cubrir los flujos críticos (login, perfil, reportes,
    // geometría/estado del mapa). Subir gradualmente conforme se añadan specs.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/app/**/*.ts'],
      exclude: [
        'src/app/**/*.spec.ts',
        'src/app/**/index.ts',
        'src/**/environment*.ts',
      ],
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 30,
        branches: 20,
      },
    },
  },
});
