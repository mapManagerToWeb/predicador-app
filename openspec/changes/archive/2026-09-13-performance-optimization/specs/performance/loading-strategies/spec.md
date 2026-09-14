## Purpose

Eliminates render-blocking resources and reduces initial payload by deferring non-critical CSS, preloading critical fonts, removing unused preconnects, and lazy-loading route-specific dependencies (Leaflet) so they are only fetched when needed.

## ADDED Requirements

### Requirement: Non-critical CSS MUST NOT block initial render

The `styles.css` stylesheet (Tailwind output) MUST be loaded without blocking the first paint. The browser MUST be able to render the page before `styles.css` finishes downloading.

#### Scenario: CSS loaded async on login page

- **WHEN** the browser loads `/login`
- **THEN** `styles.css` is loaded via `preload` with `onload` fallback, and the page renders before the stylesheet completes

#### Scenario: Noscript fallback

- **WHEN** JavaScript is disabled
- **THEN** `styles.css` is loaded as a regular blocking stylesheet via `<noscript>` fallback

### Requirement: Unused preconnect hints MUST be removed

The `tile.openstreetmap.org` preconnect hint MUST NOT be present in `index.html`. Preconnect hints MUST only exist for origins that all pages request (fonts), or be injected per-route when needed.

#### Scenario: No openstreetmap preconnect on login

- **WHEN** the browser loads `/login`
- **THEN** no `<link rel="preconnect" href="https://tile.openstreetmap.org">` tag exists in the document

#### Scenario: Map page can add preconnect dynamically

- **WHEN** the user navigates to the map route
- **THEN** the map component MAY inject a preconnect hint for `tile.openstreetmap.org` dynamically

### Requirement: Critical fonts MUST be preloaded

The Inter font (primary body font) MUST be preloaded as a font file to eliminate the render-blocking Google Fonts CSS round-trip. Font preloading MUST use `crossorigin` for correct CORS handling.

#### Scenario: Inter font preloaded

- **WHEN** the browser loads any page
- **THEN** a `<link rel="preload" href="..." as="font" type="font/woff2" crossorigin>` tag for the Inter font exists in the document head

#### Scenario: Google Fonts CSS not render-blocking

- **WHEN** the browser loads the page
- **THEN** the Google Fonts CSS link does not block first paint (loaded async or removed in favor of self-hosted fonts)

### Requirement: Leaflet MUST be lazy-loaded per route

The Leaflet library (~40KB gzipped) and its dependencies (`polygon-clipping`) MUST NOT be fetched during the initial page load. They MUST only be loaded when the user navigates to a route that uses the map.

#### Scenario: Login page does not load Leaflet

- **WHEN** the browser loads `/login`
- **THEN** no requests for `leaflet.js` or `polygon-clipping.js` appear in the network waterfall

#### Scenario: Map page loads Leaflet on demand

- **WHEN** the user navigates to the map route
- **THEN** Leaflet and its dependencies are fetched and the map renders correctly

### Requirement: Production assets MUST have aggressive cache headers

Hashed production assets (filenames containing content hashes) MUST be served with `Cache-Control: public, max-age=31536000, immutable` to eliminate unnecessary revalidation.

#### Scenario: Hashed JS chunks cached aggressively

- **WHEN** the browser requests a JS chunk with a content hash in its filename (e.g., `chunk-ABC123.js`)
- **THEN** the response includes `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Non-hashed assets use standard caching

- **WHEN** the browser requests an asset without a content hash (e.g., `index.html`)
- **THEN** the response uses standard caching headers (e.g., `no-cache` or short `max-age`)
