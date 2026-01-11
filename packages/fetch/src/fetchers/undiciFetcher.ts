/**
 * Undici-based HTTP fetcher with Fetch API compatibility.
 *
 * @module fetchers/undiciFetcher
 * @description Wraps undici's request() function to provide a Fetch API-like interface
 * with proper body resolution and response normalization.
 */

import { STATUS_CODES } from 'node:http';
import { URLSearchParams } from 'node:url';
import { types } from 'node:util';

import { Headers, FormData as UndiciFormData, request } from 'undici';
import type { RequestInit } from 'undici';

import type { ResponseLike, RequestOptions } from '../lib/types';

/** Undici request options type */
export type UndiciRequestOptions = Exclude<Parameters<typeof request>[1], undefined>;

/**
 * Resolves various body types to a format acceptable by undici's request().
 *
 * @param body - The request body in various formats
 * @returns Resolved body suitable for undici request
 * @throws {TypeError} When body type is not supported
 *
 * @description Handles the following body types:
 * - null/undefined → null
 * - string → string
 * - Uint8Array → Uint8Array
 * - ArrayBuffer → Uint8Array
 * - URLSearchParams → string
 * - DataView → Uint8Array
 * - Blob → Uint8Array
 * - FormData (undici) → FormData
 * - FormData (global) → converted to undici FormData
 * - Iterable<Uint8Array> → Buffer
 * - AsyncIterable<Uint8Array> → Buffer
 *
 * @example
 * ```typescript
 * const body = await resolveBody({ name: 'test' }); // Error - objects not supported
 * const body = await resolveBody('hello'); // 'hello'
 * const body = await resolveBody(new URLSearchParams({ a: '1' })); // 'a=1'
 * ```
 */
export async function resolveBody(
  body: RequestInit['body'],
): Promise<Exclude<UndiciRequestOptions['body'], undefined>> {
  if (body == null) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (types.isUint8Array(body)) {
    return body;
  }

  if (types.isArrayBuffer(body)) {
    return new Uint8Array(body);
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof DataView) {
    return new Uint8Array(body.buffer);
  }

  // Handle Blob if available in environment
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  // Handle undici's FormData
  if (body instanceof UndiciFormData) {
    return body;
  }

  // Handle global FormData (browser or polyfill)
  if (
    typeof (globalThis as Record<string, unknown>).FormData !== 'undefined' &&
    body instanceof ((globalThis as Record<string, unknown>).FormData as typeof FormData)
  ) {
    return globalToUndiciFormData(body as unknown);
  }

  // Handle sync iterables
  if (typeof (body as Iterable<Uint8Array>)[Symbol.iterator] === 'function') {
    const chunks = [...(body as Iterable<Uint8Array>)];
    return Buffer.concat(chunks);
  }

  // Handle async iterables
  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  throw new TypeError(`Unable to resolve body of type: ${typeof body}`);
}

/**
 * Converts global FormData to undici's FormData.
 *
 * @param fd - Global FormData instance
 * @returns Undici FormData with same entries
 *
 * @internal
 */
function globalToUndiciFormData(fd: unknown): UndiciFormData {
  const clone = new UndiciFormData();
  const anyFd = fd as { entries?: () => Iterable<[string, unknown]> };
  const entries = typeof anyFd?.entries === 'function' ? anyFd.entries() : [];

  for (const [name, value] of entries) {
    if (typeof value === 'string') {
      clone.append(name, value);
    } else {
      // Assume File-like object
      const maybeFile = value as { name?: string };
      clone.append(name, value as Blob, maybeFile?.name);
    }
  }

  return clone;
}

/**
 * Converts undici response headers to a Headers object.
 *
 * @param headers - Raw headers from undici response
 * @returns Headers object compatible with Fetch API
 *
 * @internal
 */
function convertHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        result.append(key, v);
      }
    } else {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Makes an HTTP request using undici and returns a Fetch API-like response.
 *
 * @param url - Target URL for the request
 * @param init - Request initialization options
 * @returns Promise resolving to ResponseLike object
 *
 * @description This is the low-level request function that:
 * 1. Resolves the body to an undici-compatible format
 * 2. Makes the request using undici
 * 3. Normalizes the response to Fetch API shape
 *
 * @example
 * ```typescript
 * const response = await makeRequest('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'test' }),
 * });
 *
 * if (response.ok) {
 *   const data = await response.json();
 * }
 * ```
 */
export async function makeRequest(url: string, init: RequestInit = {}): Promise<ResponseLike> {
  const options: UndiciRequestOptions = {
    ...init,
    body: await resolveBody(init.body),
  };

  const res = await request(url, options);

  return {
    body: res.body,
    async arrayBuffer() {
      return res.body.arrayBuffer();
    },
    async json<T = unknown>(): Promise<T> {
      return res.body.json() as Promise<T>;
    },
    async text() {
      return res.body.text();
    },
    get bodyUsed() {
      return res.body.bodyUsed;
    },
    headers: convertHeaders(res.headers),
    status: res.statusCode,
    statusText: STATUS_CODES[res.statusCode] ?? '',
    ok: res.statusCode >= 200 && res.statusCode < 300,
  } satisfies ResponseLike;
}

/**
 * HTTP caller function - alias for makeRequest.
 *
 * @param url - Target URL for the request
 * @param init - Request initialization options
 * @returns Promise resolving to ResponseLike object
 *
 * @description Convenience wrapper around makeRequest for consistent naming.
 *
 * @example
 * ```typescript
 * const response = await httpCaller('https://api.example.com/users', {
 *   method: 'GET',
 *   headers: { Authorization: 'Bearer token' },
 * });
 * ```
 */
export async function httpCaller(url: string, init: RequestInit = {}): Promise<ResponseLike> {
  return makeRequest(url, init);
}

/** Default export is httpCaller for convenience */
export default httpCaller;
