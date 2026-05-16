// SPDX-License-Identifier: Apache-2.0
import type { RetryOpts } from '@gertsai/async-utils';
import type { FetchSecurityConfig } from '@gertsai/fetch';

export type RestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Minimum structural shape consumed from `@gertsai/logger-factory.Logger`.
 *
 * Inlined locally so the optional `@gertsai/logger-factory` peer remains
 * truly optional (Wave 12.C-fix-2+3 PRD-034 FR-002 / Wave-13 pattern fix
 * per EVID-048 H-4). Consumers passing `@gertsai/logger-factory`'s `Logger`
 * still satisfy this interface structurally — only the methods this
 * package actually invokes are listed (`debug`, `warn`, `error`; see
 * `manager.ts`).
 */
export interface RestRequestLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface RestRequest<TBody = unknown> {
  readonly url: string;
  readonly method: RestMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: TBody;
  readonly timeoutMs?: number;
}

export interface RestResponse<T = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: T;
}

export interface RestCallOpts {
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface RestRequestManagerStats {
  readonly totalRequests: number;
  readonly totalRetries: number;
  readonly circuitOpens: number;
  readonly rateLimitedRequests: number;
  readonly circuitEvictions: number;
}

export interface RateLimitConfig {
  readonly tokensPerSecond: number;
  readonly burst?: number;
}

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly maxHosts?: number;
}

export interface RestRequestManagerOpts {
  readonly baseUrl?: string;
  readonly retry?: RetryOpts;
  readonly rateLimit?: RateLimitConfig;
  readonly circuitBreaker?: CircuitBreakerConfig;
  readonly logger?: RestRequestLogger;
  readonly redactRequestKeys?: readonly string[];
  readonly redactResponseKeys?: readonly string[];
  /**
   * Wave 8.1: forwarded verbatim to every `httpCaller` invocation from
   * {@link RestRequestManager.invoke}. Lets callers opt into local /
   * private-network targets (e.g. `http://localhost:11434` Ollama) without
   * losing the manager's retry / rate-limit / circuit-breaker layer.
   *
   * Defaults match `@gertsai/fetch`: ssrfProtection on, localhost
   * disallowed, private networks disallowed. Override only when the
   * caller has out-of-band assurance about the target (typically local
   * development infra or test fixtures).
   */
  readonly security?: FetchSecurityConfig;
}
