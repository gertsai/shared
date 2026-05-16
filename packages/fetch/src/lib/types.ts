import type { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

/**
 * Body input accepted by the package — structurally compatible with the
 * `BodyInit` shape from undici / Fetch API, but defined locally to avoid
 * leaking `undici` types into emitted `.d.ts` (Wave 12.B-fix-1).
 *
 * @description Covers the union of types that {@link resolveBody} handles at
 * runtime. Consumers can pass any of these — the runtime normaliser converts
 * to the shape undici expects.
 */
export type RequestBody =
  | string
  | ArrayBuffer
  | Uint8Array
  | DataView
  | URLSearchParams
  | Blob
  | FormData
  | Iterable<Uint8Array>
  | AsyncIterable<Uint8Array>
  | Readable
  | ReadableStream
  | null;

/**
 * Response-like interface that normalizes undici responses to Fetch API shape.
 *
 * @description Provides consistent interface for HTTP responses across different
 * environments (Node.js streams, Web streams). Defined locally (not via
 * `Pick<Response, ...>` from undici) so emitted `.d.ts` does not import
 * `undici` (Wave 12.B-fix-1, EVID-044 CRIT-2).
 */
export interface ResponseLike {
  /** Response body as Node.js Readable or Web ReadableStream */
  body: Readable | ReadableStream | null;
  /** Returns the response body as an ArrayBuffer */
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  /** Whether the body has been consumed */
  readonly bodyUsed: boolean;
  /** Response headers */
  readonly headers: Headers;
  /** Parses the response body as JSON */
  readonly json: <T = unknown>() => Promise<T>;
  /** True if status is in the 200–299 range */
  readonly ok: boolean;
  /** HTTP status code */
  readonly status: number;
  /** HTTP status text */
  readonly statusText: string;
  /** Returns the response body as a string */
  readonly text: () => Promise<string>;
}

/**
 * Security configuration for fetch operations.
 */
export interface FetchSecurityConfig {
  /** Enable SSRF protection via URL validation. Default: true */
  ssrfProtection?: boolean;
  /** Allow localhost URLs. Default: false */
  allowLocalhost?: boolean;
  /** Allow private network IPs. Default: false */
  allowPrivateNetworks?: boolean;
  /** Maximum request body size in bytes. Default: 50MB */
  maxBodySize?: number;
  /** Allowed hostnames (whitelist mode). Default: undefined (all allowed) */
  allowedHostnames?: string[];
  /** Blocked hostnames (blacklist mode). Default: [] */
  blockedHostnames?: string[];
}

/**
 * HTTP method types supported by the client.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Request options for fetch operations.
 *
 * @description Defines the public surface of caller-supplied request options.
 * Fields are listed explicitly (not via `Omit<undici.RequestInit, ...>`) so
 * the emitted `.d.ts` is independent of undici's version (Wave 12.B-fix-1).
 */
export interface RequestOptions {
  /** HTTP method (default: GET) */
  method?: HttpMethod | string;
  /** Custom headers to merge */
  headers?: Record<string, string> | Headers | [string, string][];
  /** Request body (see {@link RequestBody} for accepted shapes) */
  body?: RequestBody;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Security configuration */
  security?: FetchSecurityConfig;
}

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
