// SPDX-License-Identifier: Apache-2.0
import type { IncomingMessage } from 'node:http';
import type { HttpRequestLike } from '../strategy.js';

/**
 * Adapt a Node `IncomingMessage` to the duck-typed `HttpRequestLike`
 * shape consumed by the built-in Header / Subdomain / Path strategies.
 *
 * The function is type-only against `node:http` so the package doesn't
 * pull a runtime dependency on Node typings — `@types/node` resolves
 * lazily via TypeScript when the consumer enables it.
 */
export function nodeHttpAdapter(req: IncomingMessage): HttpRequestLike {
  return {
    headers: req.headers as Readonly<Record<string, string | string[] | undefined>>,
    ...(req.url !== undefined && { url: req.url }),
    ...(req.method !== undefined && { method: req.method }),
  };
}

export type { HttpRequestLike } from '../strategy.js';
