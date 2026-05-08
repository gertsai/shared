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
import { deepEqual } from './internal/deep-equal';
import type {
  EntityJSON,
  EntityOpts,
  ReactiveAdapter,
  UuidProvider,
} from './types';

const defaultUuidProvider: UuidProvider = () => randomUUID();

export abstract class Entity<Data extends object> extends Model {
  protected _data: Data;
  protected readonly _reactive: ReactiveAdapter;
  /**
   * Lazy uid resolver — set in the constructor. Mirrors Orchestra
   * `Entity._uidGetter`: the `_uuid` getter delegates here so a function-form
   * `opts.uid` is re-evaluated on every access (lets consumers bind the uid
   * to an upstream source).
   */
  protected readonly _uidGetter: () => string;
  protected readonly _uidPath: readonly string[] | undefined;

  constructor(opts: EntityOpts<Data> = {}) {
    super(opts);
    if (typeof opts.uid === 'function') {
      this._uidGetter = opts.uid;
    } else if (typeof opts.uid === 'string') {
      const fixed = opts.uid;
      this._uidGetter = () => fixed;
    } else {
      const provider = opts.uuidProvider ?? defaultUuidProvider;
      const generated = provider();
      this._uidGetter = () => generated;
    }
    this._uidPath = opts.uidPath;
    this._reactive = opts.reactive ?? plainReactiveAdapter;
    const seed = { ...this.$defaultData(), ...opts.data } as Data;
    this._data = this._reactive.reactive(seed);
    // Mirror Orchestra `Entity` constructor: mark the entity instance itself
    // as raw so that UI frameworks that recursively wrap (e.g., Vue `reactive`
    // applied to an array of entities) leave the instance alone. The plain
    // adapter implements this as a no-op marker symbol; the Vue adapter calls
    // into `markRaw` from `@vue/runtime-core`.
    this._reactive.markRaw(this);
  }

  /**
   * Subclass-supplied seed data. Called once at construction and shallow-merged
   * with `opts.data` — keys in `opts.data` override defaults.
   */
  abstract $defaultData(): Data;

  /**
   * Stable entity uid. If `opts.uid` was a function, it is re-evaluated on
   * each access (Orchestra parity).
   */
  get _uuid(): string {
    return this._uidGetter();
  }

  /**
   * Optional hierarchical uid path (e.g., `['tenantId', 'projectId',
   * 'entityId']`). Returned as-is; consumers decide how to interpret it.
   */
  get $uidPath(): readonly string[] | undefined {
    return this._uidPath;
  }

  /** Read-only view of the entity's current data. */
  get $data(): Readonly<Data> {
    return this._data;
  }

  /**
   * Patch the entity data with a partial object.
   *
   * By default (`check = true`), each key is compared with `deepEqual`; only
   * keys whose value actually changed are written, and the `'patched'` event
   * is emitted at most once per call (and only if at least one key changed).
   * Pass `check = false` to bypass equality comparison and force a write +
   * unconditional `'patched'` emission.
   *
   * @returns `true` if at least one key changed (or `check === false`).
   * @throws Error if called after `$destroy()`.
   */
  $patch(partial: Partial<Data>, check = true): boolean {
    if (this._destroyed) throw new Error('Cannot $patch destroyed Entity');
    if (!check) {
      Object.assign(this._data, partial);
      this.emit('patched', { partial, data: this._data });
      return true;
    }
    let changed = false;
    for (const key in partial) {
      if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
      const next = (partial as Record<string, unknown>)[key];
      const prev = (this._data as Record<string, unknown>)[key];
      if (!deepEqual(prev, next)) {
        (this._data as Record<string, unknown>)[key] = next;
        changed = true;
      }
    }
    if (changed) {
      this.emit('patched', { partial, data: this._data });
    }
    return changed;
  }

  /**
   * Plain JSON-ready representation of this entity. Subclasses (notably
   * `EntityWithMetadata`) may override to widen the shape.
   *
   * Note: data is returned by reference; if you need a deep clone, do it on
   * the consumer side. Mirrors Orchestra `Entity.toJSONObject()` with the
   * Firelord `updated_at` fallback removed (see `EntityJSON` doc).
   */
  toJSONObject(): EntityJSON<Data> {
    return { _uid: this._uuid, data: this._data };
  }

  /** `JSON.stringify` of `toJSONObject()`. */
  toJSON(): string {
    return JSON.stringify(this.toJSONObject());
  }
}
