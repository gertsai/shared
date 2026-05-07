// SPDX-License-Identifier: Apache-2.0
import type { HttpRequestLike } from '../strategy.js';

/**
 * Case-insensitive header lookup over the duck-typed `HttpRequestLike` shape.
 *
 * Different runtimes normalise header casing differently:
 *   - Node `http.IncomingMessage` lowercases names automatically.
 *   - WHATWG `Headers` is case-insensitive but exposes `.get()`, not the
 *     raw object — `nodeHttpAdapter` and friends materialise the latter.
 *   - Test fixtures often use mixed-case keys verbatim.
 *
 * Precedence (Sprint 3.10 W-3-10-8):
 *   1. EXACT-CASE match short-circuits — `headers[name]` is checked
 *      first and returned immediately when defined. This is the hot
 *      path for already-lowercased headers (Node `http.IncomingMessage`)
 *      and avoids the per-call `Object.keys` scan.
 *   2. Case-INSENSITIVE fallback iterates `Object.keys(headers)` and
 *      returns the FIRST matching key (object-iteration order). When
 *      consumers populate the headers map with both `X-Foo` and `x-foo`
 *      keys, only the exact-case match wins; the lowercase scan never
 *      runs.
 *
 * Returns the first defined value for an exact-case match, then for any
 * case-insensitive match. If multiple values are present (`string[]`),
 * returns the first element. Returns `undefined` if nothing matches.
 */
export function lookupHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) {
    return Array.isArray(direct) ? direct[0] : direct;
  }
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (value === undefined) continue;
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

export function extractHostHeader(req: HttpRequestLike): string | undefined {
  const host = lookupHeader(req.headers, 'host');
  if (!host) return undefined;
  // Strip optional `:port` suffix while leaving IPv6 brackets intact.
  if (host.startsWith('[')) {
    return host.split(']')[0]?.concat(']');
  }
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}
