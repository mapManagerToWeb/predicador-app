## Purpose

Ensures the Express SSR server applies gzip compression to all text-based HTTP responses (HTML, JS, CSS, JSON) to reduce transfer size and improve TTFB on slow connections.

## ADDED Requirements

### Requirement: Server SHALL compress text-based HTTP responses

The Express server MUST apply gzip compression to responses with text-based MIME types (`text/html`, `text/css`, `application/javascript`, `application/json`, `text/xml`, `application/xml`). Compression MUST NOT be applied to responses already compressed (e.g., images, woff2 fonts) or responses shorter than the configured threshold.

#### Scenario: HTML response is gzip-compressed

- **WHEN** the browser requests `/login` (or any HTML page)
- **THEN** the server response includes `Content-Encoding: gzip` header and the transfer size is smaller than the uncompressed equivalent

#### Scenario: Small responses skip compression

- **WHEN** the server generates a response smaller than 1 KB
- **THEN** the response MAY omit compression to avoid overhead

#### Scenario: Pre-compressed assets are not double-compressed

- **WHEN** the server serves an already-compressed asset (e.g., `.woff2`, `.png`)
- **THEN** the response MUST NOT include `Content-Encoding: gzip`

### Requirement: Compression MUST NOT break existing functionality

The compression middleware MUST NOT interfere with existing response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`), SSR rendering, or service worker responses.

#### Scenario: Security headers preserved

- **WHEN** a compressed response is sent
- **THEN** all existing security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`) are present and unchanged

#### Scenario: SSR responses compressed

- **WHEN** Angular SSR renders a page on the server
- **THEN** the rendered HTML is gzip-compressed before transfer
