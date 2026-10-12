// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * `loadOne` / `loadPage` / `loadUids` / `loadCount` — the validated
 * read choke point, Orchestra `entityQueries` parity.
 *
 * One pipeline for every read that crosses a trust boundary:
 *
 *   guard (authz hook, throws to deny)
 *     → sanitizeConstraints (validateQuery + op/field whitelist)
 *     → lifecycle predicate (soft-delete tombstones out, unless `false`)
 *     → pinned fields (server-owned scope, appended last)
 *     → provider.getDoc / getDocs / count
 *     → stripFields (internal columns never leave)
 *
 * Transports (REST actions, WS handlers, queue consumers) all call the
 * same functions, so they cannot drift apart in what they authorize —
 * the divergence Orchestra's `loadEntitiesPage` exists to prevent.
 */
import { liveConstraint, DEFAULT_LIFECYCLE } from './reader';
import type { LifecycleSpec, RowCounter, RowReader } from './reader';
import { sanitizeConstraints } from './safe-query';
import type { SafeQueryPolicy } from './safe-query';
import { stripFields, stripRows } from './strip';

/** Generic row carrier — the boundary cast lives inside the loader. */
export type Row = Record<string, unknown>;

/**
 * Authorization hook. Runs BEFORE the query reaches the provider;
 * throw to deny. Receives the collection path, the caller's raw
 * constraints (pins come later and are not the caller's claim), and
 * — for {@link loadOne} — the document id, so per-document rules
 * (Orchestra's `assertAccess` equivalent) can be expressed.
 */
export type ReadGuard = (ctx: {
  readonly path: string;
  readonly constraints: ReadonlyArray<unknown>;
  readonly id?: string;
}) => void | Promise<void>;

interface LoadBase {
  readonly reader: RowReader;
  readonly path: string;
  /** Client-supplied constraints (validated via {@link sanitizeConstraints}). */
  readonly constraints?: ReadonlyArray<unknown>;
  /** Server-side policy — op/field whitelist, pins, limit cap. */
  readonly policy?: SafeQueryPolicy;
  /** Internal fields to remove before returning. */
  readonly strip?: ReadonlyArray<string>;
  /** Soft-delete lifecycle; `false` reads tombstones deliberately. */
  readonly lifecycle?: LifecycleSpec | false;
  /** Authorization hook — throw to deny. */
  readonly guard?: ReadGuard;
}

function resolveLifecycle(
  spec: LifecycleSpec | false | undefined,
): LifecycleSpec | false {
  return spec === undefined ? DEFAULT_LIFECYCLE : spec;
}

function buildQuery(
  base: LoadBase,
): ReadonlyArray<unknown> {
  const safe = sanitizeConstraints(base.constraints ?? [], base.policy ?? {});
  const lifecycle = resolveLifecycle(base.lifecycle);
  return lifecycle === false ? safe : [liveConstraint(lifecycle), ...safe];
}

async function runGuard(base: LoadBase, id?: string): Promise<void> {
  if (base.guard === undefined) return;
  await base.guard({
    path: base.path,
    constraints: base.constraints ?? [],
    ...(id === undefined ? {} : { id }),
  });
}

/**
 * Load one row by id. Guard runs first; lifecycle filters the result;
 * strip applies last. Missing + tombstoned both return `undefined`.
 */
export async function loadOne<T extends Row = Row>(
  base: LoadBase & { readonly id: string },
): Promise<T | undefined> {
  await runGuard(base, base.id);
  const row = await base.reader.getDoc(base.path, base.id);
  const lifecycle = resolveLifecycle(base.lifecycle);
  if (
    typeof row !== 'object' ||
    row === null ||
    (lifecycle !== false &&
      (row as Row)[lifecycle.field] === lifecycle.tombstone)
  ) {
    return undefined;
  }
  return stripFields(row as T, base.strip ?? []) as T | undefined;
}

/**
 * Load a page of rows — the `loadEntitiesPage` equivalent. Lifecycle +
 * sanitized constraints + pins all reach the provider as ONE query, so
 * the scope pin is server-enforced, not post-filtered.
 */
export async function loadPage<T extends Row = Row>(
  base: LoadBase,
): Promise<T[]> {
  await runGuard(base);
  const query = buildQuery(base);
  const rows = (await base.reader.getDocs(base.path, query)) as
    | T[]
    | null
    | undefined;
  return stripRows(rows ?? [], base.strip ?? []);
}

/** Ids only — `loadPage` projected to the `id` field (or `idField`). */
export async function loadUids(
  base: LoadBase & { readonly idField?: string },
): Promise<string[]> {
  const rows = await loadPage(base);
  const field = base.idField ?? 'id';
  const out: string[] = [];
  for (const r of rows) {
    const v = r[field];
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

/** Count matching rows. Requires a {@link RowCounter}-capable reader. */
export async function loadCount(
  base: LoadBase & { readonly reader: RowReader & RowCounter },
): Promise<number> {
  await runGuard(base);
  const query = buildQuery(base);
  return base.reader.count(base.path, query);
}
