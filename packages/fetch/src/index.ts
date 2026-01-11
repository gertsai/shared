/**
 * @gerts/fetch - HTTP client wrapper for gerts.ai
 *
 * @description Provides a Fetch API-compatible HTTP client built on undici,
 * with proper body resolution and response normalization for Node.js environments.
 *
 * @packageDocumentation
 * @module @gerts/fetch
 *
 * @example Basic usage
 * ```typescript
 * import { httpCaller } from '@gerts/fetch';
 *
 * const response = await httpCaller('https://api.example.com/data', {
 *   method: 'GET',
 * });
 *
 * if (response.ok) {
 *   const data = await response.json();
 *   console.log(data);
 * }
 * ```
 *
 * @example POST with JSON body
 * ```typescript
 * import { makeRequest } from '@gerts/fetch';
 *
 * const response = await makeRequest('https://api.example.com/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
 * });
 * ```
 *
 * @example Stream response body
 * ```typescript
 * import httpCaller from '@gerts/fetch';
 *
 * const response = await httpCaller('https://api.example.com/stream');
 *
 * // response.body is a Readable stream
 * for await (const chunk of response.body) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */

// Re-export fetchers
export { httpCaller, makeRequest, resolveBody, default } from './fetchers';
export type { UndiciRequestOptions } from './fetchers';

// Re-export types
export type {
  ResponseLike,
  RequestOptions,
  HttpMethod,
  FetcherFunction,
  HttpErrorResponse,
} from './lib/types';
