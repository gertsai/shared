// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/Entity.ts (Apache 2.0).
/**
 * `Entity<Data>` — base class for any uid-addressed reactive data carrier.
 *
 * Per ADR-005 Decision B, this mirrors Orchestra's `Entity` while replacing:
 *   - `@vue/runtime-core` `shallowReactive` → pluggable `ReactiveAdapter`
 *   - `xid-ts` `Xid` generator → pluggable `UuidProvider` (defaults to
 *     `crypto.randomUUID()` — Node 22+ / browser >Q1 2024)
 *   - `lodash.isequal` → vendored `deepEqual` in `./internal/deep-equal`
 */
import { randomUUID } from 'crypto';
import { Model } from './Model';
import { plainReactiveAdapter } from './adapters/plain';
import type { EntityOpts, ReactiveAdapter, UuidProvider } from './types';

const defaultUuidProvider: UuidProvider = () => randomUUID();

export abstract class Entity<Data extends object> extends Model {
  protected _data: Data;
  protected readonly _uid: string;
  protected readonly _reactive: ReactiveAdapter;

  constructor(opts: EntityOpts<Data> = {}) {
    super(opts);
    const uuidProvider = opts.uuidProvider ?? defaultUuidProvider;
    this._uid = opts.uid ?? uuidProvider();
    this._reactive = opts.reactive ?? plainReactiveAdapter;
    const seed = { ...this.$defaultData(), ...(opts.data ?? {}) } as Data;
    this._data = this._reactive.reactive(seed);
  }

  /**
   * Subclass-supplied seed data. Called once at construction and shallow-merged
   * with `opts.data` — keys in `opts.data` override defaults.
   */
  abstract $defaultData(): Data;

  /** Stable entity uid (set at construction). */
  get _uuid(): string {
    return this._uid;
  }

  /** Read-only view of the entity's current data. */
  get $data(): Readonly<Data> {
    return this._data;
  }

  /**
   * Patch the entity data with a partial object.
   * Emits `'patched'` with `{ partial, data }`.
   *
   * @throws Error if called after `$destroy()`.
   */
  $patch(partial: Partial<Data>): void {
    if (this._destroyed) throw new Error('Cannot $patch destroyed Entity');
    Object.assign(this._data, partial);
    this.emit('patched', { partial, data: this._data });
  }
}
