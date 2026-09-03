import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import compression from 'compression';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

/**
 * Gzip compression for all text-based responses (HTML, JS, CSS, JSON).
 * Skips responses already compressed (images, woff2) and responses < 1 KB.
 */
app.use(compression());

/**
 * The API URL the frontend uses is relative (`/api/v1`), so every API call
 * from the browser lands here on the SSR origin. Requests must be proxied to
 * the API gateway. Point `GATEWAY_URL` at the gateway from the app host
 * (e.g. `http://api-gateway:8080` when the SSR runs in Docker).
 */
const gatewayUrl = process.env['GATEWAY_URL'] || 'http://localhost:8080';

/**
 * Only requests whose Host header is listed here are accepted; anything else
 * gets a 400 from the engine. Extend for the public hostname(s) served in
 * production. Alternatively set `NG_ALLOWED_HOSTS` (comma-separated) without
 * touching code.
 */
const allowedHosts =
  process.env['NG_ALLOWED_HOSTS']?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const angularApp = new AngularNodeAppEngine({ allowedHosts });

/**
 * Security hardening headers. Safe defaults that do not depend on the
 * deployment topology; a full CSP is deploy-specific and must be configured
 * with the serving infrastructure.
 */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // geolocation=(self): el botón "Mi ubicación" del mapa usa la Geolocation
  // API del propio origen; () la bloquearía a nivel navegador.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

/**
 * Reverse proxy for API calls: forwards `/api/v1/*` to the API gateway.
 * Uses Node's native `fetch`, streaming the request/response bodies and
 * passing session cookies through so authentication keeps working.
 */
app.use('/api/v1', async (req, res) => {
  const upstream = new URL(req.originalUrl, gatewayUrl);

  try {
    const upstreamResponse = await fetch(upstream, {
      method: req.method,
      headers: buildForwardHeaders(req.headers),
      body: await readRequestBody(req),
      redirect: 'manual',
    } as RequestInit);

    res.status(upstreamResponse.status);
    writeResponseHeaders(upstreamResponse, res);

    if (upstreamResponse.body) {
      Readable.fromWeb(
        upstreamResponse.body as unknown as import('node:stream/web').ReadableStream,
      ).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Proxy error to API gateway', error);
    res.status(502).json({ detail: 'El servicio de datos no está disponible.', status: 502, title: 'Servicio no disponible' });
  }
});

/**
 * Headers never forwarded to the gateway: hop-by-hop headers that Node's
 * `fetch` manages itself, plus browser-only headers that would make the
 * gateway apply its CORS policy. The SSR is the browser's origin, so proxied
 * calls are server-to-server: forwarding the browser `Origin` would trigger a
 * 403 from the gateway's CORS filter for any origin outside `allowed-origins`.
 */
const DROPPED_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
]);

export function getSetCookies(response: Response): string[] {
  const withPlural = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withPlural.getSetCookie === 'function') {
    return withPlural.getSetCookie();
  }
  const raw = withPlural.get('set-cookie');
  return raw ? [raw] : [];
}

export function buildForwardHeaders(source: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || DROPPED_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

export async function readRequestBody(req: express.Request): Promise<BodyInit | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function writeResponseHeaders(upstreamResponse: Response, res: express.Response): void {
  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (DROPPED_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    if (name.toLowerCase() === 'set-cookie') {
      for (const cookie of getSetCookies(upstreamResponse)) {
        res.append('Set-Cookie', cookie);
      }
    } else {
      res.setHeader(name, value);
    }
  }
}

/**
 * Serve static files from /browser.
 * Hashed assets (Angular's outputHashing) get immutable long-term caching.
 * Non-hashed assets (index.html, favicon) get standard no-cache behavior.
 */
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    setHeaders(res, filePath) {
      // Angular production builds hash filenames (e.g. chunk-ABC123.js).
      // These are safe to cache indefinitely since the hash changes on update.
      if (/[.-][A-Za-z0-9]{8,}\.\w+$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

/**
 * Explicit favicon handlers — Angular's SSR engine would otherwise
 * intercept these requests before express.static can serve them.
 */
app.get('/favicon.ico', (req, res) => {
  res.sendFile(join(browserDistFolder, 'favicon.ico'));
});
app.get('/favicon.svg', (req, res) => {
  res.sendFile(join(browserDistFolder, 'favicon.svg'));
});
app.get('/favicon-96x96.png', (req, res) => {
  res.sendFile(join(browserDistFolder, 'favicon-96x96.png'));
});
app.get('/apple-touch-icon.png', (req, res) => {
  res.sendFile(join(browserDistFolder, 'apple-touch-icon.png'));
});
app.get('/site.webmanifest', (req, res) => {
  res.sendFile(join(browserDistFolder, 'site.webmanifest'));
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.warn(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
