// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/entity — public type contracts.
 *
 * Backend-agnostic type contracts for Model + Entity + EntityWithMetadata.
 * No Firestore/Firelord references; no hard Vue dependency in core.
 *
 * Per ADR-005 Decision B + PRD-002 FR-W4-001..003.
 */

import type { Session } from '@gertsai/session';
/**
 * Re-export of the canonical `Session` class type from `@gertsai/session`.
 *
 * `Model` consumes Session structurally (only `operatorUuid` is read in the
 * core base), so any object exposing the same shape is also accepted; the
 * `Session` re-export keeps strong typing for consumers that build entities
 * over a real `Session` instance from `@gertsai/session`.
 */
export type { Session };

/**
 * Brand a type with a `__typename` literal — mirrors the discriminator pattern
 * used in `OrchestraEntity` so EntityWithMetadata subclasses can express their
 * runtime tag at the type level.
 */
export type WithTypename<T, Name extends string> = T & {
  readonly __typename: Name;
};

/**
 * Pluggable reactivity adapter — lets entity instances participate in a UI
 * framework's reactivity system (Vue, MobX, Solid, ...) without a hard dep.
 *
 * The default `plainReactiveAdapter` is a no-op pass-through suitable for
 * server-side / framework-free consumers. The optional Vue adapter lives in
 * `@gertsai/entity/vue` and uses `shallowReactive` / `markRaw` / `isReactive`.
 *
 * ### Notify-timing contract (Wave 19 / EVID-074 H-V1)
 *
 * Implementations MAY notify subscribers **synchronously** (inside the
 * mutating Proxy trap, before the trap returns) OR **asynchronously** via a
 * microtask / framework-scheduler. Consumers MUST NOT rely on observable
 * ordering across adapter swaps — a callback that observes a write before
 * the outer caller resumes is acceptable with one adapter but not another.
 *
 * Adapter-specific timings shipped under `@gertsai/*`:
 *  - `plainReactiveAdapter` — no notifications at all (identity adapter).
 *  - `@gertsai/entity-react`'s `reactReactiveAdapter` — **synchronous**
 *    notify inside `set` / `defineProperty` / `deleteProperty` traps.
 *  - `@gertsai/entity-svelte`'s `svelteReactiveAdapter` — **synchronous**
 *    notify (`writable.set({...target})` inside the trap).
 *  - `@gertsai/entity-solid`'s `solidReactiveAdapter` — synchronous from the
 *    trap's perspective but routed through Solid's reactive graph
 *    (`setStore(produce(...))`); Solid 1.x batches downstream signal
 *    recomputation. Treat as "sync inside trap; downstream observability
 *    follows Solid".
 *  - `@gertsai/entity-vue`'s `vueReactiveAdapter` — **microtask** via Vue's
 *    flush queue (`shallowReactive` delegates to Vue's `effect` scheduler).
 *    Subscribers observe the new value but only after the current
 *    microtask boundary.
 *
 * If a consumer needs deterministic timing across all adapters they should
 * `await Promise.resolve()` (or `await nextTick()` in Vue) between the
 * mutation and the read.
 */
export interface ReactiveAdapter {
  /** Wrap `target` in the adapter's reactive proxy (or return as-is). */
  reactive<T extends object>(target: T): T;
  /** Mark `value` so the adapter never wraps it (escape hatch). */
  markRaw<T>(value: T): T;
  /** Is `value` already a reactive object created by this adapter? */
  isReactive(value: unknown): boolean;
}

/**
 * Pluggable UUID provider. Defaults to `crypto.randomUUID()`. Replace with
 * a deterministic source for tests or with an external id generator (xid,
 * ULID, snowflake, etc.) by passing it via `EntityOpts.uuidProvider`.
 */
export type UuidProvider = () => string;

/** Constructor options for `Model`. */
export interface ModelOpts {
  readonly session?: Session;
}

/** Constructor options for `Entity`. */
export interface EntityOpts<Data extends object> extends ModelOpts {
  readonly data?: Partial<Data>;
  /**
   * Entity uid. Three forms supported:
   *  - `string`: a fixed uid set at construction.
   *  - `() => string`: a getter evaluated each time `_uuid` is read (mirrors
   *    Orchestra `Entity._uidGetter`). Lets consumers bind the uid to an
   *    upstream source (e.g., a row id, parent ref) and have it reflect
   *    automatically.
   *  - omitted: uid is generated via `uuidProvider` (default
   *    `crypto.randomUUID()`).
   */
  readonly uid?: string | (() => string);
  /**
   * Optional hierarchical id path — e.g., `['tenantId', 'projectId',
   * 'entityId']` for a nested entity in a multi-tenant model. Universal,
   * no Firestore tie. Read via `entity.$uidPath`.
   */
  readonly uidPath?: readonly string[];
  readonly reactive?: ReactiveAdapter;
  readonly uuidProvider?: UuidProvider;
}

/** Constructor options for `EntityWithMetadata`. */
export interface EntityWithMetadataOpts<
  Data extends object,
  Metadata extends object,
> extends EntityOpts<Data> {
  readonly metadata?: Partial<Metadata>;
  readonly isMockup?: boolean;
}

/**
 * Plain JSON shape produced by `Entity.toJSONObject()`.
 *
 * Mirrors Orchestra's `EntityJSON` shape with two simplifications:
 *  - no Firelord `Timestamp.toDate()` `updated_at` fallback (consumers that
 *    need a timestamp should put it in `data` themselves);
 *  - no `metadata` slot (see `EntityWithMetadataJSON`).
 *
 * Wave 26 (EVID-080 H5): `data` is typed `Readonly<Data>` to nudge
 * consumers away from mutating the returned reference — `toJSONObject()`
 * returns the live `_data` reference (no clone), so a direct mutation
 * would bypass `$patch`'s `DANGEROUS_KEYS` filter and the change-emit
 * event. If you need to mutate, take a clone first.
 */
export interface EntityJSON<Data extends object> {
  readonly _uid: string;
  readonly data: Readonly<Data>;
}

/**
 * Plain JSON shape produced by `EntityWithMetadata.toJSONObject()`.
 * Extends `EntityJSON<Data>` with the `metadata` payload and the
 * `__typename` discriminator.
 *
 * Wave 26 (EVID-080 H5): `metadata` is widened to `Readonly<Metadata>`
 * for the same reason as `data` — `toJSONObject()` returns the live
 * `_metadata` reference and consumers must clone before mutating.
 */
export interface EntityWithMetadataJSON<
  Data extends object,
  Metadata extends object,
  Typename extends string = string,
> extends EntityJSON<Data> {
  readonly metadata: Readonly<Metadata>;
  readonly __typename: Typename;
}
