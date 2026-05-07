// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { UpstreamFailureError } from '@gertsai/errors';
import { CircuitBreaker } from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('closed → open after failureThreshold consecutive failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    expect(cb.getState('h1')).toBe('closed');
    cb.recordFailure('h1');
    cb.recordFailure('h1');
    cb.recordFailure('h1');
    expect(cb.getState('h1')).toBe('open');
    expect(cb.getOpensCount()).toBe(1);
  });

  it('open → throws UpstreamFailureError on preflight', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    cb.recordFailure('h2');
    expect(() => cb.preflight('h2')).toThrowError(UpstreamFailureError);
  });

  it('open → half-open after resetTimeoutMs; success closes the breaker', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5 });
    cb.recordFailure('h3');
    expect(cb.getState('h3')).toBe('open');
    await new Promise((r) => setTimeout(r, 10));
    // preflight must transition to half-open without throwing
    cb.preflight('h3');
    expect(cb.getState('h3')).toBe('half-open');
    cb.recordSuccess('h3');
    expect(cb.getState('h3')).toBe('closed');
  });

  it('half-open → re-opens on subsequent failure', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5 });
    cb.recordFailure('h4');
    await new Promise((r) => setTimeout(r, 10));
    cb.preflight('h4');
    expect(cb.getState('h4')).toBe('half-open');
    cb.recordFailure('h4');
    expect(cb.getState('h4')).toBe('open');
    expect(cb.getOpensCount()).toBe(2);
  });

  it('LRU eviction: 1001st host insert evicts the least-recently-used entry', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000, maxHosts: 1000 });
    for (let i = 0; i < 1000; i++) {
      cb.recordFailure(`host-${i}`);
    }
    expect(cb.getEvictionsCount()).toBe(0);
    // host-0 is the oldest by insertion order
    cb.recordFailure('host-1000');
    expect(cb.getEvictionsCount()).toBe(1);
    // host-0 should now be unknown (closed-by-default semantics)
    expect(cb.getState('host-0')).toBe('closed');
    // host-1000 is open
    expect(cb.getState('host-1000')).toBe('open');
  });
});
