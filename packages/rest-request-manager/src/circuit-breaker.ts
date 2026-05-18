// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview Per-host circuit breaker.
 *
 * Wave 14.1 (PRD-044 / EVID-057): the bespoke LRU `hosts` Map + private
 * `touch()` / `create()` helpers were consolidated into the shared
 * `LruMap` kernel from `@gertsai/utils/lru`. Public API + ADR-009
 * Amendment 1.2.1 default `maxHosts: 1000` (CWE-770/401) are unchanged.
 */
import { UpstreamFailureError } from '@gertsai/errors';
import { LruMap } from '@gertsai/utils/lru';
import type { CircuitBreakerConfig } from './types.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

interface HostState {
  state: CircuitState;
  failures: number;
  openedAtMs: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_HOSTS = 1000;

/**
 * Per-host circuit breaker backed by a bounded LRU map per ADR-009
 * Amendment 1.2.1 (CWE-770/401 protection — bounded memory).
 *
 * State machine:
 *   - closed: pass-through; failures increment a counter.
 *   - open: short-circuit calls; throws `UpstreamFailureError` until
 *     `resetTimeoutMs` elapses, then transitions to half-open.
 *   - half-open: allow a single probe call; success closes the breaker,
 *     failure re-opens.
 *
 * Eviction: when `maxHosts` is exceeded, the least-recently-used host
 * entry is dropped (closed-by-default semantics on next access).
 * Recency is bumped on every `preflight`/`recordSuccess`/`recordFailure`
 * call via `LruMap.get` (touches recency).
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly maxHosts: number;
  private readonly hosts: LruMap<string, HostState>;
  private opensCount = 0;
  private evictionsCount = 0;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.maxHosts = config?.maxHosts ?? DEFAULT_MAX_HOSTS;
    this.hosts = new LruMap<string, HostState>({ maxSize: this.maxHosts });
  }

  /**
   * Throws `UpstreamFailureError` if the circuit for `host` is open.
   * Updates LRU recency on access. Transitions open → half-open after
   * `resetTimeoutMs`.
   */
  preflight(host: string): void {
    const state = this.hosts.get(host);
    if (state === undefined) return;

    if (state.state === 'open') {
      const elapsed = Date.now() - state.openedAtMs;
      if (elapsed >= this.resetTimeoutMs) {
        state.state = 'half-open';
        return;
      }
      throw new UpstreamFailureError({
        message: `Circuit breaker open for ${host}`,
        details: { upstream: host, state: 'open' },
      });
    }
  }

  recordSuccess(host: string): void {
    const state = this.hosts.get(host);
    if (state === undefined) return;
    state.failures = 0;
    if (state.state !== 'closed') {
      state.state = 'closed';
    }
  }

  recordFailure(host: string): void {
    let state = this.hosts.get(host);
    if (state === undefined) {
      state = this.create(host);
    }
    state.failures += 1;
    if (state.state === 'half-open') {
      state.state = 'open';
      state.openedAtMs = Date.now();
      this.opensCount += 1;
    } else if (state.state === 'closed' && state.failures >= this.failureThreshold) {
      state.state = 'open';
      state.openedAtMs = Date.now();
      this.opensCount += 1;
    }
  }

  getState(host: string): CircuitState {
    // Observability getter — uses `peek` to avoid perturbing LRU order.
    const state = this.hosts.peek(host);
    if (state === undefined) return 'closed';
    if (state.state === 'open') {
      const elapsed = Date.now() - state.openedAtMs;
      if (elapsed >= this.resetTimeoutMs) return 'half-open';
    }
    return state.state;
  }

  getOpensCount(): number {
    return this.opensCount;
  }

  getEvictionsCount(): number {
    return this.evictionsCount;
  }

  reset(): void {
    this.hosts.clear();
    this.opensCount = 0;
    this.evictionsCount = 0;
  }

  /**
   * Create a closed-by-default entry. `LruMap.set` already handles
   * oldest-entry eviction when `size >= maxSize`; we observe that via
   * size delta to maintain `evictionsCount` for metrics.
   */
  private create(host: string): HostState {
    const sizeBefore = this.hosts.size;
    const state: HostState = { state: 'closed', failures: 0, openedAtMs: 0 };
    this.hosts.set(host, state);
    if (sizeBefore === this.maxHosts) {
      // LruMap dropped an entry to make room.
      this.evictionsCount += 1;
    }
    return state;
  }
}
