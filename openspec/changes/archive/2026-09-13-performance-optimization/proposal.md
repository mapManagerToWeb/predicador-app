## Why

The login page (`/login`) has measurable performance bottlenecks identified by Chrome DevTools performance tracing: missing gzip compression on the Express server, render-blocking CSS and fonts, an unused preconnect hint, and Leaflet (a ~40KB map library) loading eagerly on a page that doesn't use it. While Core Web Vitals are currently "Good" (LCP 1.66s, CLS 0.00), these issues compound on slower connections and will worsen as the app grows. Fixing them now prevents regressions and establishes performance best practices for the codebase.

## What Changes

- Add gzip compression middleware to the Express SSR server
- Remove the unused `tile.openstreetmap.org` preconnect from `index.html`
- Defer render-blocking Google Fonts CSS using `preload` + `onload` pattern
- Lazy-load Leaflet so it's only fetched on the map page, not the login page
- Set aggressive cache headers for hashed production assets (`styles.css`, JS chunks)
- Self-host or preload critical fonts to eliminate render-blocking external CSS

## Capabilities

### New Capabilities

- `performance/compression`: Gzip/brotli compression on the Express SSR server for HTML, JS, and CSS responses
- `performance/loading-strategies`: Deferred CSS loading, font preloading, and lazy-loaded route dependencies to eliminate render-blocking resources and reduce initial payload

### Modified Capabilities

<!-- No existing capabilities are modified — this is new performance infrastructure -->

## Impact

- **Server**: `src/server.ts` (Express) — new `compression` middleware dependency
- **HTML**: `src/index.html` — font loading strategy changes, preconnect removal
- **Routes**: `src/app/app.routes.ts` — Leaflet/map component lazy-loaded
- **Components**: Map-related components may need dynamic imports for Leaflet
- **Dependencies**: New `compression` + `@types/compression` packages
- **Build**: No build config changes expected (Angular production optimization already enabled)
