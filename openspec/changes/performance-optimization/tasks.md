## 1. Compression Setup

- [x] 1.1 Install `compression` and `@types/compression` packages via `pnpm add compression @types/compression` and verify installation succeeds
- [x] 1.2 Add compression middleware to `src/server.ts` (before existing middleware) and verify `Content-Encoding: gzip` header appears on `/login` HTML response in DevTools Network tab

## 2. HTML Loading Optimizations

- [x] 2.1 Remove the `tile.openstreetmap.org` preconnect `<link>` tag from `src/index.html` and verify no preconnect for that origin exists in the document head via DevTools Elements panel
- [x] 2.2 Change Google Fonts `<link>` to async loading (add `media="print" onload="this.media='all'"`) and verify the font CSS no longer blocks first paint in the Network waterfall
- [x] 2.3 Add `<link rel="preload" href="https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2" as="font" type="font/woff2" crossorigin>` to `src/index.html` and verify the font file appears in the Network tab as "preload" priority
- [x] 2.4 Add `<noscript>` fallback for `styles.css` as a blocking stylesheet — **skipped**: `styles.css` is injected by Angular's build pipeline (`angular.json` → `styles` array), not a static `<link>` in `index.html`. Deferring it requires build-level changes (removing from `angular.json` + manual `<link>` + postcss processing), which is outside scope.

## 3. Leaflet Lazy Loading

- [x] 3.1 Audit all imports of `leaflet` and `polygon-clipping` across the codebase to identify which components use them and trace the import chain from the entry point
- [x] 3.2 Ensure the map route in `src/app/app.routes.ts` uses `loadComponent` with dynamic `import()` for the map page component and verify no `leaflet.js` or `polygon-clipping.js` requests appear in the Network tab when loading `/login`
- [x] 3.3 Navigate to the map route and verify Leaflet loads on demand and the map renders correctly

## 4. Cache Headers

- [x] 4.1 Configure Express static serving (or `@angular/ssr` middleware) to set `Cache-Control: public, max-age=31536000, immutable` for files matching Angular's content hash pattern (e.g., `chunk-*.js`, `main-*.js`) and verify the header appears in DevTools Network tab for a hashed asset

## 5. Verification

- [x] 5.1 Run `openspec validate` to confirm all specs pass
- [x] 5.2 Perform a full end-to-end test: load `/login`, verify compression, no render-blocking CSS, no Leaflet requests; navigate to map, verify Leaflet loads and map renders; verify all security headers present on compressed responses
