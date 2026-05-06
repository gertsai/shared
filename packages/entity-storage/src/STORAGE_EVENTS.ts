// SPDX-License-Identifier: Apache-2.0
/**
 * Event names emitted by {@link BaseEntityStorageService} via Node's
 * `EventEmitter`. Frozen const-object so consumers can subscribe with
 * strong typing and IDE autocompletion:
 *
 * ```ts
 * service.on(STORAGE_EVENTS.ENTITY_CREATED, ({ id, data }) => { ... });
 * ```
 *
 * Mirrors the Wave 4A `SESSION_EVENTS` const-object pattern from
 * `@gertsai/session`. Per SPEC-008 audit fix F-T-7.
 */
export const STORAGE_EVENTS = {
  /** Emitted after a successful `set(...)` (initial create). */
  ENTITY_CREATED: 'entity-created',
  /** Emitted after a successful `update(...)`. */
  ENTITY_UPDATED: 'entity-updated',
  /** Emitted after a successful soft-`delete(...)`. */
  ENTITY_DELETED: 'entity-deleted',
  /** Emitted after a successful `restore(...)` (reverses soft-delete). */
  ENTITY_RESTORED: 'entity-restored',
  /** Emitted once when `$destroy()` is first called (idempotent). */
  DESTROYED: 'destroyed',
} as const;

/** Literal union of all event-name string values. */
export type StorageEventName =
  (typeof STORAGE_EVENTS)[keyof typeof STORAGE_EVENTS];
