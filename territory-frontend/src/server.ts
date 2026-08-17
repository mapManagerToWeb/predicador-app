import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { Readable } from 'node:stream';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

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
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/**
 * Reverse proxy for API calls: forwards `/api/v1/*` to the API gateway.
 * Uses Node's native `fetch`, streaming the request/response bodies and
 * passing session cookies through so authentication keeps working.
 */
app.use('/api/v1', async (req, res) => {
  const upstream = new URL(req.originalUrl, gatewayUrl);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
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

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = Readable.toWeb(req) as unknown as BodyInit;
  }

  try {
    const upstreamResponse = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      duplex: 'half',
    } as RequestInit);

    res.status(upstreamResponse.status);

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

function getSetCookies(response: Response): string[] {
  const withPlural = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withPlural.getSetCookie === 'function') {
    return withPlural.getSetCookie();
  }
  const raw = withPlural.get('set-cookie');
  return raw ? [raw] : [];
}

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

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
