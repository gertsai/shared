// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/session/OrchestraSession.class.ts (Apache 2.0).
// This file mirrors the OrchestraSession lifecycle 1:1 with all Vue
// (`@vue/runtime-core`) and Orchestra-DI (`@orchlab/di`) couplings stripped
// per ADR-005. Reactivity is intentionally out of scope: consumers can wrap
// instances in their own reactive primitive if they need it.
import { EventEmitter } from 'events';

import type {
  AbstractDialog,
  ClientPlatform,
  ErrorHandler,
  OperatorRef,
  OperatorType,
  SessionOpts,
  TokenGetter,
} from './types';
import { SESSION_EVENTS } from './types';
// Phase B (Sprint 3.6 team-lead): swapped from `_errors-stub` to `@gertsai/errors` after pnpm install resolved workspace symlink. Stub deleted.
// Original Amendment 1.4 fallback note (preserved for context):
// workspace symlink resolves and the package re-exports these classes.
// See SPEC-011 Amendment 1.4 / ADR-006.
import { UnauthorizedError, ValidationError } from '@gertsai/errors';

/**
 * Backend-agnostic session bound to a single operator identity.
 *
 * The Session captures who is making a request (`operatorUuid` +
 * `operatorType`), what client surface they are coming from
 * (`clientPlatform` + `clientVersion`), how to acquire a fresh bearer token
 * (`tokenGetter`), and a UI surface for prompts (`dialog`).
 *
 * In addition to the operator identity, a Session can carry a separate
 * `dataAccessUuid` describing whose data should be loaded — used by AI
 * agents that act *on behalf of* a human user but mutate data under their
 * own bot identity.
 *
 * Lifecycle events:
 *   - `operator-switched` — fired after `$switchOperator` succeeds.
 *   - `destroyed` — fired once when `$destroy` is first called.
 *
 * @example
 *   const session = new Session({
 *     operatorUuid: 'user-123',
 *     operatorType: 'web',
 *     tokenGetter: async () => fetchAccessToken(),
 *     dialog: myDialog,
 *     clientPlatform: 'web',
 *     clientVersion: '1.0.0',
 *   });
 *   const token = await session.token;
 */
export class Session extends EventEmitter {
  private _operatorUuid: string;
  private _operatorType: OperatorType;
  private readonly _tokenGetter: TokenGetter;
  private readonly _dialog: AbstractDialog;
  private readonly _clientPlatform: ClientPlatform;
  private readonly _clientVersion: string;
  private readonly _errorHandler: ErrorHandler;
  private _dataAccessUuid: string | undefined;
  private _destroyed = false;
  // Sprint 3.6 Wave 5 Phase 1 — additive multi-tenant scoping per ADR-006
  // Decision C / I-17. Flat tags, no enforced hierarchy.
  private readonly _tenantId: string | undefined;
  private readonly _projectId: string | undefined;
  private readonly _spaceId: string | undefined;

  constructor(opts: SessionOpts) {
    super();
    this._operatorUuid = opts.operatorUuid;
    this._operatorType = opts.operatorType;
    this._tokenGetter = opts.tokenGetter;
    this._dialog = opts.dialog;
    this._clientPlatform = opts.clientPlatform;
    this._clientVersion = opts.clientVersion;
    this._errorHandler =
      opts.errorHandler ??
      ((err) => {
        // Default: swallow. Consumers wanting visibility must inject one.
        void err;
      });
    this._dataAccessUuid = opts.dataAccessUuid;
    this._tenantId = opts.tenantId;
    this._projectId = opts.projectId;
    this._spaceId = opts.spaceId;
  }

  /**
   * Resolved bearer token via the injected `tokenGetter`. Rejects if the
   * session has already been destroyed so stale callers fail loudly.
   */
  get token(): Promise<string> {
    if (this._destroyed) return Promise.reject(new Error('Session destroyed'));
    return this._tokenGetter();
  }

  get operatorUuid(): string {
    return this._operatorUuid;
  }

  get operatorType(): OperatorType {
    return this._operatorType;
  }

  get dialog(): AbstractDialog {
    return this._dialog;
  }

  get clientPlatform(): ClientPlatform {
    return this._clientPlatform;
  }

  get clientVersion(): string {
    return this._clientVersion;
  }

  get errorHandler(): ErrorHandler {
    return this._errorHandler;
  }

  /**
   * UUID used for data access scoping. When unset, falls back to the
   * operator's own uuid (the common case).
   */
  get dataAccessUuid(): string {
    return this._dataAccessUuid ?? this._operatorUuid;
  }

  /**
   * `true` when the data-access scope has been explicitly overridden to a
   * different identity than the operator's. Useful for telemetry and
   * audit-log decoration ("operator X loaded data as Y").
   */
  get isOperatorScopeOverridden(): boolean {
    return (
      this._dataAccessUuid !== undefined &&
      this._dataAccessUuid !== this._operatorUuid
    );
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Tenant scope tag (Sprint 3.6 Wave 5 Phase 1, ADR-006 Decision C).
   * Returns `undefined` when not provided at construction.
   */
  get tenantId(): string | undefined {
    return this._tenantId;
  }

  /**
   * Project scope tag. Flat — independent of `tenantId`/`spaceId` per
   * ADR-006 I-17 (no enforced hierarchy).
   */
  get projectId(): string | undefined {
    return this._projectId;
  }

  /**
   * Space scope tag. Flat — independent of `tenantId`/`projectId` per
   * ADR-006 I-17 (no enforced hierarchy).
   */
  get spaceId(): string | undefined {
    return this._spaceId;
  }

  /**
   * Strict accessor for `tenantId`. Throws `UnauthorizedError` (from
   * `@gertsai/errors`) if missing — multi-tenancy is an authentication
   * boundary per ADR-006 I-16.
   *
   * @throws UnauthorizedError when `tenantId` was not set at construction.
   */
  getTenantStrict(): string {
    if (this._tenantId === undefined) {
      throw new UnauthorizedError({
        message:
          'Session has no tenantId scope; multi-tenant operation requires tenant context',
        details: { reason: `session-operator-${this._operatorUuid}-missing-tenant-scope` },
      });
    }
    return this._tenantId;
  }

  /**
   * Strict accessor for `projectId`. Throws `ValidationError` (from
   * `@gertsai/errors`) if missing — project absence is an invalid-input
   * condition, NOT an authentication failure (ADR-006 I-16).
   *
   * @throws ValidationError when `projectId` was not set at construction.
   */
  getProjectStrict(): string {
    if (this._projectId === undefined) {
      throw new ValidationError({
        message: 'Session has no projectId scope',
        details: { field: 'projectId', constraint: 'required-on-strict-call' },
      });
    }
    return this._projectId;
  }

  /**
   * Strict accessor for `spaceId`. Throws `ValidationError` if missing,
   * matching `getProjectStrict` semantics per ADR-006 I-16.
   *
   * @throws ValidationError when `spaceId` was not set at construction.
   */
  getSpaceStrict(): string {
    if (this._spaceId === undefined) {
      throw new ValidationError({
        message: 'Session has no spaceId scope',
        details: { field: 'spaceId', constraint: 'required-on-strict-call' },
      });
    }
    return this._spaceId;
  }

  /**
   * Switch the active operator identity. Emits
   * {@link SESSION_EVENTS.OPERATOR_SWITCHED} with `{ prev, current }`.
   *
   * @throws if called on a destroyed session.
   */
  $switchOperator(operator: OperatorRef): void {
    if (this._destroyed) {
      throw new Error('Cannot $switchOperator on destroyed session');
    }
    const prev: OperatorRef = {
      _uid: this._operatorUuid,
      type: this._operatorType,
    };
    this._operatorUuid = operator._uid;
    this._operatorType = operator.type;
    this.emit(SESSION_EVENTS.OPERATOR_SWITCHED, { prev, current: operator });
  }

  /**
   * Override or clear the data-access UUID used for scoping reads. Pass
   * `undefined` to fall back to the operator's own uuid.
   *
   * @throws if called on a destroyed session.
   */
  $setDataAccessUuid(uuid: string | undefined): void {
    if (this._destroyed) {
      throw new Error('Cannot $setDataAccessUuid on destroyed session');
    }
    this._dataAccessUuid = uuid;
  }

  /**
   * Tear down the session. Idempotent: only the first call emits
   * {@link SESSION_EVENTS.DESTROYED} and removes listeners.
   */
  $destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.emit(SESSION_EVENTS.DESTROYED);
    this.removeAllListeners();
  }
}
