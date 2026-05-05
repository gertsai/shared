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
  readonly uid?: string;
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
