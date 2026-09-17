/**
 * Performance verification tests for MapLibre GL JS lazy-loading.
 *
 * Verifies that maplibre-gl is imported dynamically (via `import()`) and
 * never enters the main bundle.  This is critical for keeping the initial
 * JavaScript payload small — maplibre-gl is ~600 KB minified.
 *
 * Corresponds to OpenSpec F3.6 / T28 (Performance verification).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const TERRITORY_ROOT = path.resolve(__dirname, '../../../../../');

describe('MapLibre lazy-loading (T28)', () => {
  it('createMaplibreEngine dynamically imports maplibre-engine.service', async () => {
    const factoryModule = await import('./map-engine.factory');
    const fnStr = factoryModule.createMaplibreEngine.toString();

    // Vite transforms `import()` to `__vite_ssr_dynamic_import__` in test mode
    const hasDynamicImport =
      fnStr.includes('import(') ||
      fnStr.includes('__vite_ssr_dynamic_import__');
    expect(hasDynamicImport).toBe(true);
    expect(fnStr).toContain('maplibre-engine.service');
  });

  it('MaplibreEngineService.loadMaplibre dynamically imports maplibre-gl', async () => {
    // Read the source file directly to check for dynamic import pattern
    const sourcePath = path.resolve(__dirname, './maplibre-engine.service.ts');
    const source = await fs.readFile(sourcePath, 'utf-8');

    // The loadMaplibre method should contain `await import('maplibre-gl')`
    expect(source).toContain("await import('maplibre-gl')");
  });

  it('maplibre-gl is listed as a production dependency', async () => {
    const pkgPath = path.resolve(TERRITORY_ROOT, 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies!['maplibre-gl']).toBeDefined();
    expect(pkg.dependencies!['maplibre-gl']).toMatch(/^\^/);
  });

  it('MapEngine interface only uses type-only imports from maplibre-gl', async () => {
    const interfacePath = path.resolve(
      __dirname,
      './map-engine.interface.ts',
    );
    const source = await fs.readFile(interfacePath, 'utf-8');

    const importLines = source
      .split('\n')
      .filter((line) => line.startsWith('import'));

    for (const line of importLines) {
      if (line.includes('maplibre-gl')) {
        expect(line).toMatch(/import\s+type/);
      }
    }
  });

  it('tile-version.service does not import maplibre-gl', async () => {
    const servicePath = path.resolve(
      __dirname,
      './tile-version.service.ts',
    );
    const source = await fs.readFile(servicePath, 'utf-8');

    expect(source).not.toContain("from 'maplibre-gl'");
    expect(source).not.toContain('from "maplibre-gl"');
  });

  it('map-picking.service only uses type-only imports from maplibre-gl', async () => {
    const servicePath = path.resolve(
      __dirname,
      './map-picking.service.ts',
    );
    const source = await fs.readFile(servicePath, 'utf-8');

    const lines = source
      .split('\n')
      .filter((l) => l.includes('maplibre-gl'));

    for (const line of lines) {
      expect(line).toMatch(/import\s+type/);
    }
  });

  it('map-engine.factory.ts uses dynamic import (not static) for maplibre-engine.service', async () => {
    const factoryPath = path.resolve(__dirname, './map-engine.factory.ts');
    const source = await fs.readFile(factoryPath, 'utf-8');

    // Should NOT have a static import of maplibre-engine.service
    const hasStaticImport = source
      .split('\n')
      .some(
        (line) =>
          line.startsWith('import') &&
          !line.startsWith('import type') &&
          line.includes('maplibre-engine.service'),
      );
    expect(hasStaticImport).toBe(false);

    // Should have a dynamic import() call (may be multi-line)
    expect(source).toContain("import(");
    expect(source).toContain("'./maplibre-engine.service'");
  });

  it('maplibre-engine.service.ts uses dynamic import for maplibre-gl (not static)', async () => {
    const servicePath = path.resolve(
      __dirname,
      './maplibre-engine.service.ts',
    );
    const source = await fs.readFile(servicePath, 'utf-8');

    // Should NOT have a static import of maplibre-gl at the top level
    const lines = source.split('\n');
    const topLevelImports = lines.filter(
      (line) =>
        (line.startsWith('import ') || line.startsWith('import{')) &&
        line.includes('maplibre-gl') &&
        !line.includes('import type'),
    );
    expect(topLevelImports).toHaveLength(0);

    // Should have a dynamic import inside a method
    expect(source).toContain("await import('maplibre-gl')");
  });
});
