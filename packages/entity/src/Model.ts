// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/OrchestraModel.ts (Apache 2.0).
/**
 * `Model` — base class for any domain object that owns a session and emits
 * lifecycle events. Backend-agnostic (no Firestore, no Vue). Mirrors
 * `OrchestraModel` 1:1 with two simplifications per ADR-005 Decision B:
 *
 *   - Session is **optional** (no global-session singleton; consumers pass it
 *     explicitly or work session-less).
 *   - `$destroy()` is idempotent and removes all listeners after emitting.
 */
import { EventEmitter } from 'events';
import type { ModelOpts, Session } from './types';

export abstract class Model extends EventEmitter {
  protected _session: Session | null;
  protected _destroyed = false;

  constructor(opts: ModelOpts = {}) {
    super();
    this._session = opts.session ?? null;
  }

  /** Operator UUID from the bound session, or `null` if no session. */
  get $operatorUuid(): string | null {
    return this._session?.operatorUuid ?? null;
  }

  /** Bound session, or `null` if none was provided. */
  get $session(): Session | null {
    return this._session;
  }

  /** True after `$destroy()` has been called. */
  get $destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Emit `'destroyed'`, drop the session reference, and remove all listeners.
   * Idempotent — calling twice is a no-op.
   */
  $destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.emit('destroyed');
    this.removeAllListeners();
    this._session = null;
  }
}
