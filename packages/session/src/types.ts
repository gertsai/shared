// SPDX-License-Identifier: Apache-2.0
/**
 * Backend-agnostic session identity types.
 *
 * Mirrors Orchestra orchlab/core/src/session AbstractDialog/OrchestraPlatform
 * shapes (Apache 2.0) but with all Vue / Orchestra-DI coupling removed per
 * ADR-005. Used by `@gertsai/api-core` and other consumers as the canonical
 * "who is making this request" descriptor.
 */

/**
 * Distinct operator categories that can act on the system.
 *
 * Categories grouped by purpose:
 *  - **Human surfaces**: `web`, `ios`, `android`, `electron`, `desktop`, `cli`,
 *    `tui`, `extension` (browser extension).
 *  - **Programmatic**: `api`, `sdk`, `webhook`, `cron`, `service`, `auth`
 *    (auth-service callers — token issuance, refresh, revocation flows).
 *  - **Agent / automation**: `ai`, `agent`, `assistant`, `bot`.
 *  - **Protocol-bridges**: `mcp` (Model Context Protocol), `grpc`, `graphql`.
 *  - **System / internal**: `system`, `migration`, `test`, `unknown`.
 *
 * The union is open in spirit: consumers are free to extend via TypeScript
 * declaration merging if they need additional categories. Mirrors Orchestra's
 * OrchestraPlatform with broader OSS coverage and no Firebase / Cloud
 * Functions terminology.
 */
export type OperatorType =
  // Human surfaces
  | 'web'
  | 'ios'
  | 'android'
  | 'electron'
  | 'desktop'
  | 'cli'
  | 'tui'
  | 'extension'
  // Programmatic
  | 'api'
  | 'sdk'
  | 'webhook'
  | 'cron'
  | 'service'
  | 'auth'
  // Agent / automation
  | 'ai'
  | 'agent'
  | 'assistant'
  | 'bot'
  // Protocol bridges
  | 'mcp'
  | 'grpc'
  | 'graphql'
  // System / internal
  | 'system'
  | 'migration'
  | 'test'
  | 'unknown';

/**
 * Alias kept for symmetry with Orchestra naming. `clientPlatform` describes
 * the runtime origin of the request; for most callers this matches
 * `operatorType`, but the two are kept distinct so a `system` operator can
 * still report `web` as its UI surface, etc.
 */
export type ClientPlatform = OperatorType;

/**
 * Minimal interactive prompt surface used by higher-level packages
 * (`api-core` retry-on-conflict flows, `api-rlr` rate-limit prompts).
 *
 * Implementations decide presentation (HTML modal, CLI prompt, no-op).
 */
export interface AbstractDialog {
  /** Ask the user a yes/no question. Resolves with the user's choice. */
  confirm(message: string): Promise<boolean>;
  /** Show a passive informational message. */
  alert(message: string): void;
  /** Surface an error to the user. */
  error(err: Error | unknown): void;
}

/**
 * Lazy token provider. Sessions never store the bearer token directly so
 * that consumers can refresh it on demand without re-creating the session.
 */
export type TokenGetter = () => Promise<string>;

/** Side-channel for non-fatal errors discovered by Session-aware code. */
export type ErrorHandler = (err: Error | unknown) => void;

/**
 * Construction options for {@link Session}. All fields are immutable after
 * construction except via the explicit `$switchOperator` /
 * `$setDataAccessUuid` mutators.
 */
export interface SessionOpts {
  readonly operatorUuid: string;
  readonly operatorType: OperatorType;
  readonly tokenGetter: TokenGetter;
  readonly dialog: AbstractDialog;
  readonly clientPlatform: ClientPlatform;
  readonly clientVersion: string;
  readonly errorHandler?: ErrorHandler;
  readonly dataAccessUuid?: string;
}

/**
 * Lightweight reference to an operator entity passed to
 * {@link Session.$switchOperator}. Matches the `{ _uid, type }` shape used
 * by Orchestra so existing call-sites can be migrated 1:1.
 */
export interface OperatorRef {
  readonly _uid: string;
  readonly type: OperatorType;
}

/**
 * Event names emitted on a {@link Session} via Node's EventEmitter.
 *
 * Frozen const-object so consumers can subscribe with strong typing:
 *   `session.on(SESSION_EVENTS.OPERATOR_SWITCHED, ...)`.
 */
export const SESSION_EVENTS = {
  OPERATOR_SWITCHED: 'operator-switched',
  DESTROYED: 'destroyed',
} as const;
