// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/OrchestraEntity.ts (Apache 2.0).
/**
 * `EntityWithMetadata<Data, Metadata, Typename>` — entity that additionally
 * carries a metadata object and a `__typename` discriminator.
 *
 * Mirrors `OrchestraEntity` with backend-agnostic dependencies and the
 * mockup/staled lifecycle expressed as event emissions:
 *   - `$markSaved()` emits `'saved'` and clears `_isMockup`
 *   - `$markStaled()` emits `'staled'` (idempotent)
 *   - `$markFresh()` emits `'refreshed'` (idempotent)
 *   - `$setMetadata()` emits `'metadata-changed'` with `{ partial, metadata }`
 *
 * Per ADR-005 Decision B + PRD-002 FR-W4-003.
 */
import { Entity } from './Entity';
import { deepEqual } from './internal/deep-equal';
import { DANGEROUS_KEYS } from './internal/dangerous-keys';
import type {
  EntityWithMetadataJSON,
  EntityWithMetadataOpts,
} from './types';

export abstract class EntityWithMetadata<
  Data extends object,
  Metadata extends object,
  Typename extends string = string,
> extends Entity<Data> {
  protected _metadata: Metadata;
  /**
   * Mockup flag. Default polarity intentionally diverges from Orchestra:
   *
   *   Orchestra `OrchestraEntity` defaults `metadata.isMockup` to **`false`**
   *   (entity assumed already persisted unless told otherwise).
   *
   *   `@gertsai/entity` defaults `_isMockup` to **`true`** — a fresh
   *   `new MyEntity()` is unsaved/optimistic until `$markSaved()` runs.
   *
   * Migration note: any `if (!entity.$isMockup) { ... }` branches inherited
   * from Orchestra source must be re-audited — they will now run for
   * unsaved entities by default. Two semantic aliases of the same boolean
   * are exposed (`$isUnsaved`, `$isOptimistic`) so consumers can pick the
   * naming that fits their domain best.
   */
  protected _isMockup: boolean;
  protected _isStaled: boolean;
  abstract readonly __typename: Typename;

  constructor(opts: EntityWithMetadataOpts<Data, Metadata> = {}) {
    super(opts);
    const seedMeta = {
      ...this.$defaultMetadata(),
      ...opts.metadata,
    } as Metadata;
    this._metadata = this._reactive.reactive(seedMeta);
    this._isMockup = opts.isMockup ?? true;
    this._isStaled = false;
  }

  /** Subclass-supplied seed metadata. */
  abstract $defaultMetadata(): Metadata;

  /** Read-only view of the entity's metadata. */
  get $metadata(): Readonly<Metadata> {
    return this._metadata;
  }

  /**
   * True until `$markSaved()` is called.
   *
   * **Default**: `true` on construction (polarity intentionally inverted from
   * Orchestra `OrchestraEntity`, which defaults to `false`). See class JSDoc.
   * Aliases: `$isUnsaved`, `$isOptimistic`.
   */
  get $isMockup(): boolean {
    return this._isMockup;
  }

  /**
   * Alias of `$isMockup` — semantic naming for "this entity has not been
   * persisted to the backend yet".
   */
  get $isUnsaved(): boolean {
    return this._isMockup;
  }

  /**
   * Alias of `$isMockup` — semantic naming for "this entity exists only in
   * memory as an optimistic / pre-server placeholder".
   */
  get $isOptimistic(): boolean {
    return this._isMockup;
  }

  /** True after `$markStaled()`; cleared by `$markFresh()`. */
  get $isStaled(): boolean {
    return this._isStaled;
  }

  /**
   * Merge `partial` into metadata.
   *
   * By default (`check = true`), each key is compared with `deepEqual`; only
   * keys whose value actually changed are written, and the
   * `'metadata-changed'` event is emitted at most once per call (and only if
   * at least one key changed). Pass `check = false` to bypass equality
   * comparison and force a write + unconditional emission.
   *
   * @returns `true` if at least one key changed (or `check === false`).
   * @throws Error if called after `$destroy()`.
   */
  $setMetadata(partial: Partial<Metadata>, check = true): boolean {
    if (this._destroyed)
      throw new Error('Cannot $setMetadata on destroyed Entity');
    if (!check) {
      // CWE-1321 protection per PRD-033 FR-002: filtered loop replaces
      // `Object.assign` (which would propagate `__proto__` setter).
      for (const key of Object.keys(partial)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        (this._metadata as Record<string, unknown>)[key] = (
          partial as Record<string, unknown>
        )[key];
      }
      this.emit('metadata-changed', { partial, metadata: this._metadata });
      return true;
    }
    let changed = false;
    for (const key in partial) {
      // CWE-1321 protection per PRD-033 FR-002.
      if (DANGEROUS_KEYS.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
      const next = (partial as Record<string, unknown>)[key];
      const prev = (this._metadata as Record<string, unknown>)[key];
      if (!deepEqual(prev, next)) {
        (this._metadata as Record<string, unknown>)[key] = next;
        changed = true;
      }
    }
    if (changed) {
      this.emit('metadata-changed', { partial, metadata: this._metadata });
    }
    return changed;
  }

  /** Transition `isMockup: true → false` and emit `'saved'`. */
  $markSaved(): void {
    this._isMockup = false;
    this.emit('saved');
  }

  /** Transition `isStaled: false → true` and emit `'staled'`. Idempotent. */
  $markStaled(): void {
    if (this._isStaled) return;
    this._isStaled = true;
    this.emit('staled');
  }

  /** Transition `isStaled: true → false` and emit `'refreshed'`. Idempotent. */
  $markFresh(): void {
    if (!this._isStaled) return;
    this._isStaled = false;
    this.emit('refreshed');
  }

  /**
   * Plain JSON-ready representation, widened from {@link Entity.toJSONObject}
   * with the `metadata` payload and the `__typename` discriminator.
   */
  override toJSONObject(): EntityWithMetadataJSON<Data, Metadata, Typename> {
    return {
      _uid: this._uuid,
      data: this._data,
      metadata: this._metadata,
      __typename: this.__typename,
    };
  }
}
