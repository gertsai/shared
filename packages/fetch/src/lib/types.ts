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
 * Request options extending undici's RequestInit with additional features.
 */
export interface RequestOptions extends Omit<RequestInit, 'headers'> {
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Custom headers to merge */
  headers?: Record<string, string> | Headers | [string, string][];
  /** Security configuration */
  security?: FetchSecurityConfig;
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
