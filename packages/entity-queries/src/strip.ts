// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Server-field stripping — the projection half of the read path.
 *
 * Orchestra learned this the expensive way (embeddings leaking through
 * an API path that skipped the provider): internal columns must be
 * stripped at the storage boundary, in the same choke point that reads
 * them — never in each transport separately.
 *
 * Rows are copied, not mutated: providers may hand out references into
 * an internal cache (the in-memory adapter does), and mutating the
 * returned object would corrupt the store itself.
 */

/**
 * Fields stripped by default — the mutation journal. `update_action`
 * is dispatch metadata, not client data: exposing it would hand a
 * subscriber the vocabulary of internal saga steps.
 *
 * Audit timestamps (`created_at`, `updated_by_uuid`, …) are NOT in the
 * default set — Orchestra keeps them client-visible, and apps that
 * disagree pass them explicitly in `strip`.
 */
export const DEFAULT_SERVER_FIELDS: ReadonlyArray<string> = Object.freeze([
  'update_action',
]);

/** Return a copy of `row` without `fields`. `null`/`undefined` pass through. */
export function stripFields<T extends Record<string, unknown>>(
  row: T | null | undefined,
  fields: ReadonlyArray<string>,
): T | undefined {
  if (row === null || row === undefined) return undefined;
  if (fields.length === 0) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    delete out[f];
  }
  return out as T;
}

/** {@link stripFields} mapped over a list. Empty `fields` returns `rows` as-is. */
export function stripRows<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>,
  fields: ReadonlyArray<string>,
): T[] {
  if (fields.length === 0) return [...rows];
  const out: T[] = [];
  for (const r of rows) {
    const stripped = stripFields(r, fields);
    if (stripped !== undefined) out.push(stripped);
  }
  return out;
}
