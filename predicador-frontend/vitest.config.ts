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
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['src/test-setup.ts'],
    // Coverage con V8 (nativo del runtime, sin instrumentation). Umbrales
    // conservadores para no bloquear CI mientras se agrega cobertura al
    // resto del código. Subir gradualmente conforme se añadan specs.
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
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
