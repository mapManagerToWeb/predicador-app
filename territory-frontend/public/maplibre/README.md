# MapLibre GL JS vendored worker

These files are copies of MapLibre GL JS **v6.10.0** build artifacts and must
stay in lockstep with the installed `maplibre-gl` version:

| File | Source (in `node_modules/maplibre-gl/dist/`) | Purpose |
| --- | --- | --- |
| `maplibre-gl-worker.mjs` | `maplibre-gl-worker.mjs` | Vector-tile parse worker |
| `maplibre-gl-shared.mjs` | `maplibre-gl-shared.mjs` | Worker's sibling module (imported by **relative path**) |

## Why vendored

MapLibre GL JS v6 ships the parsing worker as a separate ESM module that
imports `./maplibre-gl-shared.mjs` relative to its own location, so the two
files must always be served next to each other — a missing sibling silently
kills all vector tile loading with no console error.

- The Angular application builder (esbuild) does **not** reliably emit
  `?worker&url` / `?url` asset imports of files inside `node_modules`
  (verified against 6.10.0: the import was inlined and the worker files were
  never emitted), and the Vite dev-server optimizeDeps pass chokes on the
  worker's relative import.
- `public/` is always served at the root in dev **and** copied verbatim into
  the production browser output, so this is the one mechanism that
  guarantees both files land together in every mode.
- `MaplibreEngineService` registers the worker via `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')`.

## Updating after a `maplibre-gl` version bump

```bash
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/maplibre/
cp node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs public/maplibre/
```

Then re-verify in a real browser that `/maplibre/maplibre-gl-worker.mjs` is
fetched and the `.pbf` tiles load.