import { STATUS_CODES } from 'node:http';
import { URLSearchParams } from 'node:url';
import { types } from 'node:util';

import { Headers, FormData as UndiciFormData, request } from 'undici';
import type { RequestInit } from 'undici';

import type { ResponseLike } from '../lib/types';

export type RequestOptions = Exclude<Parameters<typeof request>[1], undefined>;

export async function makeRequest(
  url: string,
  init: RequestInit,
): Promise<ResponseLike> {
  const options = {
    ...init,
    body: await resolveBody(init.body),
  } as RequestOptions;

  const res = await request(url, options);

  return {
    body: res.body,
    async arrayBuffer() {
      return res.body.arrayBuffer();
    },
    async json() {
      return res.body.json();
    },
    async text() {
      return res.body.text();
    },
    get bodyUsed() {
      return res.body.bodyUsed;
    },
    headers: new Headers(res.headers as Record<string, string[] | string>),
    status: res.statusCode,
    statusText: STATUS_CODES[res.statusCode] ?? '',
    ok: res.statusCode >= 200 && res.statusCode < 300,
  } satisfies ResponseLike;
}

export async function httpCaller(
  url: string,
  init: RequestInit,
): Promise<ResponseLike> {
  return makeRequest(url, init);
}

export async function resolveBody(
  body: RequestInit['body'],
): Promise<Exclude<RequestOptions['body'], undefined>> {
  if (body == null) {
    return null;
  } else if (typeof body === 'string') {
    return body;
  } else if (types.isUint8Array(body)) {
    return body;
  } else if (types.isArrayBuffer(body)) {
    return new Uint8Array(body);
  } else if (body instanceof URLSearchParams) {
    return body.toString();
  } else if (body instanceof DataView) {
    return new Uint8Array(body.buffer);
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  } else if (body instanceof UndiciFormData) {
    return body;
  } else if (
    typeof (globalThis as any).FormData !== 'undefined' &&
    body instanceof (globalThis as any).FormData
  ) {
    return globalToUndiciFormData(body as unknown);
  } else if ((body as Iterable<Uint8Array>)[Symbol.iterator]) {
    const chunks = [...(body as Iterable<Uint8Array>)];
    return Buffer.concat(chunks);
  } else if ((body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  throw new TypeError('Unable to resolve body.');
}

function globalToUndiciFormData(fd: unknown): UndiciFormData {
  const clone = new UndiciFormData();
  const anyFd = fd as { entries?: () => Iterable<[string, any]> };
  const entries = typeof anyFd?.entries === 'function' ? anyFd.entries() : [];
  for (const [name, value] of entries as Iterable<[string, any]>) {
    if (typeof value === 'string') {
      clone.append(name, value);
    } else {
      const maybeFile: any = value;
      clone.append(name, maybeFile, maybeFile?.name);
    }
  }

  return clone;
}
