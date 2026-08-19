import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const h = vi.hoisted(() => {
  const appMock = { use: vi.fn(), get: vi.fn() };
  const expressMock = vi.fn(() => appMock);
  expressMock.static = vi.fn(() => vi.fn());
  return { appMock, expressMock };
});

vi.mock('express', () => ({ default: h.expressMock }));
vi.mock('@angular/ssr/node', () => ({
  AngularNodeAppEngine: class {
    handle = vi.fn();
  },
  createNodeRequestHandler: vi.fn(() => vi.fn()),
  isMainModule: vi.fn(() => false),
  writeResponseToNodeResponse: vi.fn(),
}));

import { buildForwardHeaders, readRequestBody, writeResponseHeaders, getSetCookies } from './server';

describe('server proxy helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildForwardHeaders', () => {
    it('drops hop-by-hop and browser-only headers and forwards the rest', () => {
      const headers = buildForwardHeaders({
        host: 'localhost:4000',
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        cookie: 'session=abc',
        'accept-language': ['es', 'en'],
      } as never);

      expect(headers.get('host')).toBeNull();
      expect(headers.get('origin')).toBeNull();
      expect(headers.get('content-type')).toBe('application/json');
      expect(headers.get('cookie')).toBe('session=abc');
      expect(headers.get('accept-language')).toBe('es, en');
    });

    it('skips undefined header values', () => {
      const headers = buildForwardHeaders({ 'x-empty': undefined } as never);

      expect(headers.has('x-empty')).toBe(false);
    });
  });

  describe('readRequestBody', () => {
    it('returns undefined for GET and HEAD requests', async () => {
      const req = { method: 'GET' } as never;
      const head = { method: 'HEAD' } as never;

      await expect(readRequestBody(req)).resolves.toBeUndefined();
      await expect(readRequestBody(head)).resolves.toBeUndefined();
    });

    it('buffers the streamed request body for non-GET methods', async () => {
      const req = Object.assign(Readable.from([Buffer.from('hola'), Buffer.from(' mundo')]), {
        method: 'POST',
      });

      const body = await readRequestBody(req as never);

      expect(Buffer.from(body as ArrayBuffer).toString()).toBe('hola mundo');
    });
  });

  describe('writeResponseHeaders', () => {
    it('copies upstream headers and appends set-cookie values individually', () => {
      const upstream = new Response(null, {
        headers: { 'content-type': 'application/json', 'set-cookie': 'a=1; Path=/' },
      });
      const res = { append: vi.fn(), setHeader: vi.fn() };

      writeResponseHeaders(upstream, res as never);

      expect(res.setHeader).toHaveBeenCalledWith('content-type', 'application/json');
      expect(res.append).toHaveBeenCalledWith('Set-Cookie', 'a=1; Path=/');
    });

    it('skips dropped headers when writing to the response', () => {
      const upstream = new Response(null, {
        headers: { 'transfer-encoding': 'chunked', 'x-ok': '1' },
      });
      const res = { append: vi.fn(), setHeader: vi.fn() };

      writeResponseHeaders(upstream, res as never);

      expect(res.setHeader).not.toHaveBeenCalledWith('transfer-encoding', 'chunked');
      expect(res.setHeader).toHaveBeenCalledWith('x-ok', '1');
    });
  });

  describe('getSetCookies', () => {
    it('uses getSetCookie when available', () => {
      const response = {
        headers: { getSetCookie: () => ['a=1', 'b=2'] },
      } as unknown as Response;

      expect(getSetCookies(response)).toEqual(['a=1', 'b=2']);
    });

    it('falls back to the raw set-cookie header', () => {
      const response = {
        headers: { get: () => 'a=1', getSetCookie: undefined },
      } as unknown as Response;

      expect(getSetCookies(response)).toEqual(['a=1']);
    });
  });
});