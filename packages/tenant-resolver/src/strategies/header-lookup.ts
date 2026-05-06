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
