// SPDX-License-Identifier: Apache-2.0
import type { RetryOpts } from '@gertsai/async-utils';
import type { Logger } from '@gertsai/logger-factory';

export type RestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

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
  readonly logger?: Logger;
  readonly redactRequestKeys?: readonly string[];
  readonly redactResponseKeys?: readonly string[];
}
