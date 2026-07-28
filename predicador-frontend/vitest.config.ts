/// <reference types="vitest/globals" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
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
        lines: 20,
        statements: 20,
        functions: 20,
        branches: 20,
      },
    },
  },
});
