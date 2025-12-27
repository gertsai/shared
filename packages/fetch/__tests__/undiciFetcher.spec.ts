import http from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { httpCaller } from '../dist/cjs/index.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/json') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ hello: 'world', n: 42 }));
      return;
    }
    if (req.url === '/text') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end('hello');
      return;
    }
    if (req.url === '/status404') {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      res.end('not found');
      return;
    }
    if (req.url === '/stream') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.setHeader('transfer-encoding', 'chunked');
      res.write('part1');
      setTimeout(() => {
        res.write('-part2');
        res.end('-end');
      }, 10);
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain');
    res.end('ok');
  });

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  if (address && typeof address === 'object') {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('httpCaller', () => {
  it('JSON response', async () => {
    const res = await httpCaller(`${baseUrl}/json`, { method: 'GET' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ hello: 'world', n: 42 });
  });

  it('text response', async () => {
    const res = await httpCaller(`${baseUrl}/text`, { method: 'GET' });
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe('hello');
  });

  it('non-OK status', async () => {
    const res = await httpCaller(`${baseUrl}/status404`, { method: 'GET' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe('not found');
  });

  it('streaming body available', async () => {
    const res = await httpCaller(`${baseUrl}/stream`, { method: 'GET' });
    expect(res.ok).toBe(true);
    // ResponseLike requires body to be Readable or ReadableStream
    expect(res.body).not.toBeNull();
    const text = await res.text();
    expect(text).toBe('part1-part2-end');
  });
});
