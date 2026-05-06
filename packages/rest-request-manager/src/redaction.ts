// SPDX-License-Identifier: Apache-2.0
import { REDACTION_KEYS } from '@gertsai/errors/http';

const DEFAULT_KEYS_LOWER = new Set(REDACTION_KEYS.map((k) => k.toLowerCase()));

/**
 * Apply REDACTION_KEYS (Sprint 3.6 I-14, reused per ADR-009 I-9) to the
 * given value before logging. Object keys matching the redaction list
 * (case-insensitive) have their value replaced with `'[REDACTED]'`.
 *
 * Recursive over nested plain objects/arrays to defend logged request
 * and response bodies. Primitive values are returned as-is.
 *
 * @param value — value about to be logged.
 * @param extraKeys — additional consumer-supplied keys (set-union with defaults).
 * @returns redacted clone.
 */
export function redact(value: unknown, extraKeys?: readonly string[]): unknown {
  const keys = extraKeys && extraKeys.length > 0
    ? new Set([...DEFAULT_KEYS_LOWER, ...extraKeys.map((k) => k.toLowerCase())])
    : DEFAULT_KEYS_LOWER;
  return redactInternal(value, keys, new WeakSet());
}

function redactInternal(value: unknown, keys: ReadonlySet<string>, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, keys, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactInternal(v, keys, seen);
    }
  }
  return out;
}
