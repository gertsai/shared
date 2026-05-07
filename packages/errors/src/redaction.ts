// SPDX-License-Identifier: Apache-2.0

/**
 * Default redaction list per ADR-006 I-14. Keys are matched
 * case-insensitively. Used by `/http` and `/grpc` wire serialization
 * to scrub credentials from outbound `details` payloads.
 *
 * NOTE: internal `AppError.toJSON()` does NOT redact — callers writing
 * to logs are responsible for their own redaction policy.
 */
export const REDACTION_KEYS: readonly string[] = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'pwd',
  'passwd',
  'private_key',
  'privateKey',
  'connection_string',
  'connectionString',
];

const REDACTION_SET = new Set(REDACTION_KEYS.map((k) => k.toLowerCase()));

/**
 * Maximum recursion depth for `redactDetails` deep-scan per ADR-010
 * I-15 (Sprint 3.10 W-3-10-3). Mirrors the Sprint 3.6 I-13 cause-cycle
 * guard depth budget.
 */
const MAX_DEPTH = 5;

/**
 * Maximum number of keys/items scanned per object/array level. Breadth
 * cap protects against unbounded payload-size redaction scan when an
 * adversary crafts a `details` object with millions of keys (DoS
 * mitigation per ADR-010 §A1.3).
 */
const MAX_BREADTH = 1000;

/**
 * Recursively replace values for any key matching `REDACTION_KEYS`
 * (case-insensitive) with `'[REDACTED]'`.
 *
 * Sprint 3.10 (ADR-010 I-15, W-3-10-3) — switched from shallow to
 * deep-scan. Bounds:
 *
 *   - max recursion depth: 5 (returns `'[REDACTED:depth]'` for deeper
 *     nesting; mirrors Sprint 3.6 I-13 cause-cycle pattern);
 *   - max breadth: 1000 keys/items per object/array level (truncates
 *     overflow with marker `'[REDACTED:breadth>1000]'`);
 *   - cycle protection: `WeakSet` anti-cycle (returns
 *     `'[REDACTED:cycle]'` on revisit);
 *   - non-plain objects (instances of `Date`, `RegExp`, `Buffer`,
 *     custom classes…) pass through unchanged — their internal shape
 *     should not be enumerated by a generic redactor.
 *
 * Behavioural CHANGE vs. v0.1 (shallow): consumers whose nested
 * `details` contained redaction-key matches now see `'[REDACTED]'` at
 * any depth ≤ 5. This is the safer default for security-critical
 * surface; bumped MINOR per ADR-010 I-15.
 */
export function redactDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const seen = new WeakSet<object>();
  return _redactValue(details, 0, seen) as Record<string, unknown>;
}

function _redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) {
    return '[REDACTED:depth]';
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[REDACTED:cycle]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const truncated = value.length > MAX_BREADTH;
    const slice = value.slice(0, MAX_BREADTH);
    const out: unknown[] = slice.map((item) => _redactValue(item, depth + 1, seen));
    if (truncated) {
      out.push(`[REDACTED:breadth>${MAX_BREADTH}]`);
    }
    return out;
  }

  // Skip non-plain objects (Date, RegExp, Buffer, Map, Set, custom classes).
  // Plain objects are those constructed by `Object` literal or
  // `Object.create(null)` (no prototype).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const truncated = entries.length > MAX_BREADTH;
  const result: Record<string, unknown> = {};
  for (const [key, v] of entries.slice(0, MAX_BREADTH)) {
    if (REDACTION_SET.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = _redactValue(v, depth + 1, seen);
    }
  }
  if (truncated) {
    result.__truncated__ = `[REDACTED:breadth>${MAX_BREADTH}]`;
  }
  return result;
}
