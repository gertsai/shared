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
import type { EntityWithMetadataOpts } from './types';

export abstract class EntityWithMetadata<
  Data extends object,
  Metadata extends object,
  Typename extends string = string,
> extends Entity<Data> {
  protected _metadata: Metadata;
  protected _isMockup: boolean;
  protected _isStaled: boolean;
  abstract readonly __typename: Typename;

  constructor(opts: EntityWithMetadataOpts<Data, Metadata> = {}) {
    super(opts);
    const seedMeta = {
      ...this.$defaultMetadata(),
      ...(opts.metadata ?? {}),
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

  /** True until `$markSaved()` is called (default: true on construction). */
  get $isMockup(): boolean {
    return this._isMockup;
  }

  /** True after `$markStaled()`; cleared by `$markFresh()`. */
  get $isStaled(): boolean {
    return this._isStaled;
  }

  /**
   * Merge `partial` into metadata and emit `'metadata-changed'`.
   * @throws Error if called after `$destroy()`.
   */
  $setMetadata(partial: Partial<Metadata>): void {
    if (this._destroyed)
      throw new Error('Cannot $setMetadata on destroyed Entity');
    Object.assign(this._metadata, partial);
    this.emit('metadata-changed', { partial, metadata: this._metadata });
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
}
