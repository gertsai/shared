import type { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { Response, RequestInit } from 'undici';

/**
 * Response-like interface that normalizes undici responses to Fetch API shape.
 *
 * @description Provides consistent interface for HTTP responses across different
 * environments (Node.js streams, Web streams).
 */
export interface ResponseLike extends Pick<
  Response,
  'arrayBuffer' | 'bodyUsed' | 'headers' | 'json' | 'ok' | 'status' | 'statusText' | 'text'
> {
  /** Response body as Node.js Readable or Web ReadableStream */
  body: Readable | ReadableStream | null;
}

/**
 * Request options extending undici's RequestInit with additional features.
 */
export interface RequestOptions extends RequestInit {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Custom headers to merge */
  headers?: Record<string, string>;
}

/**
 * HTTP method types supported by the client.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Fetcher function signature.
 */
export type FetcherFunction = (url: string, init?: RequestOptions) => Promise<ResponseLike>;

/**
 * Error response from HTTP calls.
 */
export interface HttpErrorResponse {
  status: number;
  statusText: string;
  body?: unknown;
  headers: Headers;
}
