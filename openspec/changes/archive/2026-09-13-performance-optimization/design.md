## Context

The app is an Angular 22 SPA with SSR (Express server), served via Vite dev server in development and Angular's built-in SSR in production. The performance audit revealed 8 issues across compression, render-blocking resources, unused preconnects, and eager loading of Leaflet. See proposal.md for full motivation.

Current state:
- Express server has no compression middleware
- `index.html` has render-blocking Google Fonts CSS and an unused `tile.openstreetmap.org` preconnect
- Leaflet is imported eagerly (likely in a shared module or barrel file), loading ~40KB on every page
- `styles.css` served with `Cache-Control: no-cache` despite Angular's `outputHashing: "all"` in production

## Goals / Non-Goals

**Goals:**
- Enable gzip compression on Express SSR server for all text-based responses
- Eliminate render-blocking CSS and font loading on initial page load
- Lazy-load Leaflet so it only fetches on the map route
- Set proper cache headers for hashed production assets
- Remove unused preconnect hints from the base HTML

**Non-Goals:**
- Full font self-hosting (downloading and serving Inter/JetBrains Mono/DM Serif Display files locally) — this is a larger change; we'll use `preload` + async loading instead
- Brotoni compression (gzip only for now; brotli can be added later)
- Service worker cache strategy changes
- Core Angular bootstrap optimization (SSR already configured)
- Image optimization (logo.jpeg is the only image, already 304'd)

## Decisions

### 1. Use `compression` middleware (gzip) on Express

**Decision**: Add the `compression` npm package to the Express SSR server.

**Why**: It's the standard, battle-tested Express compression middleware. Handles gzip negotiation automatically, respects `Accept-Encoding`, and skips already-compressed responses.

**Alternatives considered**:
- Manual `zlib.createGzip()` — more control but reinvents the wheel
- `shrink-ray` — heavier, adds ETag manipulation we don't need
- Reverse proxy compression (nginx/Cloudflare) — good for production but doesn't help local dev or self-hosted deployments

**Trade-off**: Adds ~50KB dependency, but it's well-maintained and widely used.

### 2. Defer `styles.css` via preload + onload pattern — NOT IMPLEMENTED

**Decision**: Originally planned to change the `<link rel="stylesheet" href="styles.css">` tag to `<link rel="preload" as="style" onload="this.onload=null;this.rel='stylesheet'">` with a `<noscript>` fallback.

**Status**: Skipped. `styles.css` is injected by Angular's build pipeline (`angular.json` → `styles` array), not a static `<link>` in `index.html`. Removing it from `angular.json` would bypass PostCSS/Tailwind processing, breaking the build. A post-build HTML transformation or custom Angular plugin would be needed.

**Why**: This is the simplest approach that works without build config changes. Tailwind's utility CSS is mostly needed after first paint — the browser can paint the basic layout with inline styles or critical CSS, then apply utilities as they load.

**Alternatives considered**:
- Critical CSS inlining via Angular build — requires `critical` package or build plugin, more complex
- Tailwind `@layer` with `@media` — doesn't actually defer loading
- Post-build PurgeCSS — would require new tooling

**Trade-off**: Brief flash of unstyled content (FOUC) possible on very fast connections. Mitigated by the fact that Angular's SSR output already includes inline styles for the initial render.

### 3. Preload Inter font, async-load Google Fonts CSS

**Decision**: Add a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the Inter woff2 file, and change the Google Fonts `<link>` to async loading.

**Why**: Inter is the primary body font — preloading it eliminates the FOIT (flash of invisible text). The Google Fonts CSS link becomes non-critical once the font file is preloaded.

**Alternatives considered**:
- Self-host all fonts — ideal but requires downloading, hosting, and maintaining font files; bigger scope
- `font-display: swap` only — already in the Google Fonts URL (`&display=swap`), but the CSS itself still blocks

**Trade-off**: Preloaded font file URL is version-pinned (Google Fonts URL). If Google updates the font, the preload URL may become stale. Low risk since Inter is stable.

### 4. Lazy-load Leaflet via Angular route-level dynamic imports

**Decision**: Use Angular's `loadComponent` (or `loadChildren`) in the route definition for the map page, with dynamic `import()` for Leaflet.

**Why**: Angular's router already supports lazy loading via `loadComponent`. Leaflet is only used on the map route, so there's no reason to load it on login or other pages.

**Alternatives considered**:
- `@defer` blocks in Angular templates — would defer template rendering but not the JS bundle
- Manual `import()` in component constructor — works but less declarative than route-level lazy loading
- Preload strategy with `preload=True` — defeats the purpose

**Trade-off**: First visit to the map route will have a brief loading delay as Leaflet fetches. Subsequent visits benefit from browser cache.

### 5. Cache headers via Express static middleware config

**Decision**: Configure Express's `express.static` (or `@angular/ssr`'s serving) to set `Cache-Control: public, max-age=31536000, immutable` for files matching the Angular content hash pattern (`*-[A-Za-z0-9]*.*`).

**Why**: Angular's production build already hashes filenames (`outputHashing: "all"`), so these files are safe to cache indefinitely. The hash changes when content changes, busting the cache automatically.

**Alternatives considered**:
- Service worker caching — already configured via `ngsw-config.json`, but cache headers still matter for the initial load
- CDN-level headers — doesn't help self-hosted deployments

**Trade-off**: If Angular's hash format changes in a future version, the pattern match may need updating. Low risk.

## Risks / Trade-offs

- **FOUC with deferred CSS** → Mitigated by SSR rendering the initial HTML structure. The flash is minimal because Angular's server-rendered HTML already has semantic structure.
- **Font preload URL staleness** → Google Fonts URLs are version-pinned. If Inter updates, the preloaded file may differ from what Google Fonts CSS provides. Mitigation: periodically verify the preload URL matches the current Google Fonts version.
- **Leaflet lazy-loading first-visit delay** → Users visiting the map for the first time will see a loading delay. Mitigation: the map route can show a skeleton/spinner while Leaflet loads. Browser cache helps on repeat visits.
- **Compression on small responses** → gzip on tiny payloads can slightly increase size. Mitigation: `compression` middleware has a default `threshold` (1KB) that skips small responses.

## Migration Plan

1. Install `compression` and `@types/compression`
2. Add compression middleware to `src/server.ts` (before other middleware)
3. Update `src/index.html`: ~~defer `styles.css`~~ (skipped — Angular-injected), preload Inter font, remove openstreetmap preconnect, async Google Fonts
4. Audit Leaflet imports to ensure they're only in map-route components; use `loadComponent` with dynamic import
5. Configure cache headers for hashed assets in the server
6. Test: verify compression via `Content-Encoding: gzip` header in DevTools Network tab
7. Test: verify no Leaflet requests on `/login` network waterfall
8. Test: verify map page still loads and renders correctly

**Rollback**: Each change is independent — remove the middleware, revert `index.html` changes, restore eager Leaflet imports. No data migration involved.

## Open Questions

- Should we self-host fonts entirely (download woff2 files, serve from `/public/fonts/`) or stick with Google Fonts + preload? Self-hosting eliminates the external dependency but adds maintenance. This can be decided later without changing the specs.
