import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { httpCaller, makeRequest, resolveBody } from '../src/fetchers/undiciFetcher';
import { FormData as UndiciFormData } from 'undici';

describe('resolveBody', () => {
  it('should return null for null/undefined', async () => {
    expect(await resolveBody(null)).toBeNull();
    expect(await resolveBody(undefined)).toBeNull();
  });

  it('should return string as-is', async () => {
    const body = 'hello world';
    expect(await resolveBody(body)).toBe(body);
  });

  it('should return Uint8Array as-is', async () => {
    const body = new Uint8Array([1, 2, 3]);
    expect(await resolveBody(body)).toBe(body);
  });

  it('should convert ArrayBuffer to Uint8Array', async () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);

    const result = await resolveBody(buffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('should convert URLSearchParams to string', async () => {
    const params = new URLSearchParams({ foo: 'bar', baz: 'qux' });
    expect(await resolveBody(params)).toBe('foo=bar&baz=qux');
  });

  it('should convert DataView to Uint8Array', async () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([4, 5, 6]);
    const dataView = new DataView(buffer);

    const result = await resolveBody(dataView);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual([4, 5, 6]);
  });

  it('should handle undici FormData', async () => {
    const formData = new UndiciFormData();
    formData.append('name', 'test');

    const result = await resolveBody(formData);
    expect(result).toBe(formData);
  });

  it('should convert sync iterable to Buffer', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
    const iterable: Iterable<Uint8Array> = {
      [Symbol.iterator]: () => chunks[Symbol.iterator](),
    };

    const result = await resolveBody(iterable);
    expect(result).toBeInstanceOf(Buffer);
    expect(Array.from(result as Buffer)).toEqual([1, 2, 3, 4]);
  });

  it('should convert async iterable to Buffer', async () => {
    async function* generator(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([5, 6]);
      yield new Uint8Array([7, 8]);
    }

    const result = await resolveBody(generator());
    expect(result).toBeInstanceOf(Buffer);
    expect(Array.from(result as Buffer)).toEqual([5, 6, 7, 8]);
  });

  it('should throw TypeError for unsupported body type', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(resolveBody({ foo: 'bar' } as any)).rejects.toThrow(TypeError);
  });
});

describe('httpCaller / makeRequest', () => {
  let server: Server;
  let baseUrl: string;

  /** Security config to allow localhost for testing */
  const testSecurity = { security: { allowLocalhost: true } };

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      // Echo endpoint
      if (url.pathname === '/echo') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.end(
            JSON.stringify({
              method: req.method,
              headers: req.headers,
              body: body || null,
              query: Object.fromEntries(url.searchParams),
            }),
          );
        });
        return;
      }

      // JSON endpoint
      if (url.pathname === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'hello', number: 42 }));
        return;
      }

      // Text endpoint
      if (url.pathname === '/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, World!');
        return;
      }

      // Status codes
      if (url.pathname === '/status') {
        const code = parseInt(url.searchParams.get('code') || '200', 10);
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: code }));
        return;
      }

      // Headers echo
      if (url.pathname === '/headers') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value',
        });
        res.end(JSON.stringify({ receivedHeaders: req.headers }));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should make GET request and parse JSON', async () => {
    const response = await httpCaller(`${baseUrl}/json`, testSecurity);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');

    const data = (await response.json()) as { message: string; number: number };
    expect(data.message).toBe('hello');
    expect(data.number).toBe(42);
  });

  it('should make GET request and parse text', async () => {
    const response = await httpCaller(`${baseUrl}/text`, testSecurity);

    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toBe('Hello, World!');
  });

  it('should make POST request with JSON body', async () => {
    const response = await makeRequest(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
      ...testSecurity,
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as { method: string; body: string };
    expect(data.method).toBe('POST');
    expect(JSON.parse(data.body)).toEqual({ name: 'test' });
  });

  it('should handle 404 status correctly', async () => {
    const response = await httpCaller(`${baseUrl}/nonexistent`, testSecurity);

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  it('should handle 500 status correctly', async () => {
    const response = await httpCaller(`${baseUrl}/status?code=500`, testSecurity);

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  it('should include response headers', async () => {
    const response = await httpCaller(`${baseUrl}/headers`, testSecurity);

    expect(response.headers.get('x-custom-header')).toBe('test-value');
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  it('should send custom headers', async () => {
    const response = await httpCaller(`${baseUrl}/echo`, {
      method: 'GET',
      headers: { 'X-Test-Header': 'my-value' },
      ...testSecurity,
    });

    const data = (await response.json()) as { headers: Record<string, string> };
    expect(data.headers['x-test-header']).toBe('my-value');
  });

  it('should track bodyUsed state', async () => {
    const response = await httpCaller(`${baseUrl}/json`, testSecurity);

    expect(response.bodyUsed).toBe(false);
    await response.json();
    expect(response.bodyUsed).toBe(true);
  });

  it('should handle URLSearchParams body', async () => {
    const params = new URLSearchParams({ foo: 'bar', baz: 'qux' });
    const response = await makeRequest(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      ...testSecurity,
    });

    const data = (await response.json()) as { body: string };
    expect(data.body).toBe('foo=bar&baz=qux');
  });
});
