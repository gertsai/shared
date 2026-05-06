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
 * Replace values for any key matching `REDACTION_KEYS` (case-insensitive)
 * with `'[REDACTED]'`. Shallow scan — nested objects are not traversed
 * (deliberate: details should be flat per AppError typing convention).
 */
export function redactDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = REDACTION_SET.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}
