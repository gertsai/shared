// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Minimal structural read surface + soft-delete lifecycle predicate.
 *
 * {@link RowReader} is the smallest honest contract a caller needs for
 * entity reads — any `IStorageProvider<Meta>` satisfies it structurally
 * (method bivariance), so the helpers stay Meta-agnostic and providers
 * never need an adapter cast at the call site.
 *
 * The lifecycle predicate mirrors the rule `entity-audit`'s
 * `buildDataForDelete` stamps: a soft-deleted row carries
 * `entity_status === 'deleted'` and MUST NOT be returned by live
 * reads. One derivation, every consumer — a second copy is how a
 * tombstoned board leaked through a member-row lookup once already.
 */

/** Minimal read contract — satisfied by `IStorageProvider<Meta>` for any Meta. */
export interface RowReader {
  getDoc(path: string, id: string): Promise<unknown>;
  getDocs(path: string, query?: unknown): Promise<unknown>;
}

/** Optional counting contract for {@link loadCount}. */
export interface RowCounter {
  count(path: string, query?: unknown): Promise<number>;
}

/**
 * Soft-delete lifecycle spec. Defaults match the audit stamps:
 * `entity_status === 'deleted'` marks a tombstone.
 *
 * Pass `lifecycle: false` to load functions to read tombstones
 * deliberately (restore flows, admin inspection).
 */
export interface LifecycleSpec {
  /** Field carrying the lifecycle marker. Default `'entity_status'`. */
  readonly field: string;
  /** Value marking a tombstoned row. Default `'deleted'`. */
  readonly tombstone: string;
}

/** Default lifecycle: `entity_status === 'deleted'` is the tombstone. */
export const DEFAULT_LIFECYCLE: LifecycleSpec = Object.freeze({
  field: 'entity_status',
  tombstone: 'deleted',
});

/** Is `row` alive under `lifecycle`? `null`/non-record rows are not live. */
export function isLive(
  row: unknown,
  lifecycle: LifecycleSpec = DEFAULT_LIFECYCLE,
): boolean {
  if (typeof row !== 'object' || row === null) return false;
  return (
    (row as Record<string, unknown>)[lifecycle.field] !== lifecycle.tombstone
  );
}

/**
 * The lifecycle predicate as a query-dsl `where` constraint — prepended
 * to every live {@link listLive}/{@link loadPage} call so tombstones are
 * excluded server-side, not after transfer.
 *
 * Returned as a structural literal (Meta-agnostic): callers compose it
 * into any `Query<Meta>`; constraint objects are plain data.
 */
export function liveConstraint(
  lifecycle: LifecycleSpec = DEFAULT_LIFECYCLE,
): { readonly kind: 'where'; readonly field: string; readonly op: '!='; readonly value: string } {
  return {
    kind: 'where',
    field: lifecycle.field,
    op: '!=',
    value: lifecycle.tombstone,
  };
}

/**
 * Fetch one row by id, applying the live predicate. Tombstoned and
 * missing rows both collapse to `undefined`.
 */
export async function getLive(
  reader: RowReader,
  path: string,
  id: string,
  lifecycle: LifecycleSpec | false = DEFAULT_LIFECYCLE,
): Promise<Record<string, unknown> | undefined> {
  const row = await reader.getDoc(path, id);
  if (typeof row !== 'object' || row === null) return undefined;
  const rec = row as Record<string, unknown>;
  if (lifecycle !== false && !isLive(rec, lifecycle)) return undefined;
  return rec;
}

/**
 * Fetch rows matching `constraints`, with the lifecycle predicate
 * prepended unless `lifecycle === false`. Missing results collapse
 * to `[]`.
 */
export async function listLive(
  reader: RowReader,
  path: string,
  constraints: ReadonlyArray<unknown>,
  lifecycle: LifecycleSpec | false = DEFAULT_LIFECYCLE,
): Promise<Record<string, unknown>[]> {
  const query =
    lifecycle === false
      ? [...constraints]
      : [liveConstraint(lifecycle), ...constraints];
  const rows = (await reader.getDocs(path, query)) as
    | Record<string, unknown>[]
    | null
    | undefined;
  return rows ?? [];
}
