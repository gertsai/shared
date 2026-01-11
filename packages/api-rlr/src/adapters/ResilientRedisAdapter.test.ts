import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RLRRedis } from '../utils/types';

import { ResilientRedisAdapter } from './ResilientRedisAdapter';

describe('ResilientRedisAdapter', () => {
  let mockStore: RLRRedis;
  let adapter: ResilientRedisAdapter;

  beforeEach(() => {
    mockStore = {
      incrementSW: vi.fn(),
      gcraCheck: vi.fn(),
    } as unknown as RLRRedis;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('retry policy', () => {
    it('retries failed operations', async () => {
      const mockIncrementSW = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce([1, 5, 10, 1000]);

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 3,
        retryDelay: 100,
        retryBackoff: 'linear',
      });

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());

      expect(mockIncrementSW).toHaveBeenCalledTimes(2);
      expect(result).toEqual([1, 5, 10, 1000]);
    });

    it('fails after max retry attempts', async () => {
      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 3,
        retryDelay: 10,
        retryBackoff: 'linear',
        fallbackStrategy: 'deny', // Will return deny result instead of throwing
      });

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());

      // Should get deny fallback after retries fail
      expect(result[0]).toBe(0); // denied
      expect(result[1]).toBe(100); // limit
      expect(result[2]).toBe(60000); // timeFrame

      expect(mockIncrementSW).toHaveBeenCalledTimes(3);
    });

    it('uses exponential backoff when configured', async () => {
      const mockIncrementSW = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce([1, 5, 10, 1000]);

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 3,
        retryDelay: 10, // Small delay for faster test
        retryBackoff: 'exponential',
      });

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());

      expect(result).toEqual([1, 5, 10, 1000]);
      expect(mockIncrementSW).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker', () => {
    it('opens circuit after threshold failures', async () => {
      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 1000,
        fallbackStrategy: 'deny',
      });

      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
        expect(result[0]).toBe(0); // denied
      }

      // Circuit should be open now
      expect(adapter.getCircuitState()).toBe('open');

      // Next call should fail immediately without calling store
      const callCount = mockIncrementSW.mock.calls.length;
      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result[0]).toBe(0); // denied due to open circuit

      expect(mockIncrementSW).toHaveBeenCalledTimes(callCount); // No new calls
    });

    it('transitions to half-open after timeout', async () => {
      vi.useFakeTimers();

      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeout: 5000,
        fallbackStrategy: 'deny',
      });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
        expect(result[0]).toBe(0); // denied
      }

      expect(adapter.getCircuitState()).toBe('open');

      // Advance time past timeout
      vi.advanceTimersByTime(5001);

      // Now it should try again (half-open)
      mockIncrementSW.mockResolvedValueOnce([1, 5, 10, 1000]);

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result).toEqual([1, 5, 10, 1000]);

      vi.useRealTimers();
    });
  });

  describe('fallback strategies', () => {
    it('allows requests when fallback strategy is "allow"', async () => {
      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Redis down'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'allow',
      });

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());

      // Should return "allow" response
      expect(result).toEqual([1, 1, 60000]);
    });

    it('denies requests when fallback strategy is "deny"', async () => {
      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Redis down'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'deny',
      });

      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());

      // Should return "deny" response
      expect(result).toEqual([0, 100, 60000]);
    });

    it('uses cached result when available', async () => {
      const mockIncrementSW = vi
        .fn()
        .mockResolvedValueOnce([1, 5, 10, 1000])
        .mockRejectedValueOnce(new Error('Redis down'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'cache',
        cacheSize: 10,
        cacheTTL: 5000,
      });

      // First call succeeds and caches result
      const result1 = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result1).toEqual([1, 5, 10, 1000]);

      // Second call fails but uses cached result
      const result2 = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result2).toEqual([1, 5, 10, 1000]);
    });

    it('cache expires after TTL', async () => {
      vi.useFakeTimers();

      const mockIncrementSW = vi
        .fn()
        .mockResolvedValueOnce([1, 5, 10, 1000])
        .mockRejectedValue(new Error('Redis down'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'deny', // Will deny if no cache
        cacheSize: 10,
        cacheTTL: 1000,
      });

      // First call succeeds and caches result
      await adapter.incrementSW('test-key', 60000, 100, Date.now());

      // Advance time past cache TTL
      vi.advanceTimersByTime(1001);

      // Second call should fail and return deny response (no cache)
      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result).toEqual([0, 100, 60000]); // Deny response

      vi.useRealTimers();
    });
  });

  describe('GCRA support', () => {
    it('handles GCRA check with resilience', async () => {
      const mockGcraCheck = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce([1, 10, 0]);

      mockStore.gcraCheck = mockGcraCheck;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 2,
        retryDelay: 50,
      });

      const result = await adapter.gcraCheck('test-key', 60000, 100, 5, Date.now());

      expect(mockGcraCheck).toHaveBeenCalledTimes(2);
      expect(result).toEqual([1, 10, 0]);
    });

    it('applies correct fallback for GCRA', async () => {
      const mockGcraCheck = vi.fn().mockRejectedValue(new Error('Redis down'));

      mockStore.gcraCheck = mockGcraCheck;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'allow',
      });

      const result = await adapter.gcraCheck('test-key', 60000, 100, 5, Date.now());

      // Should return "allow" response for GCRA
      expect(result).toEqual([1, 100, 0]);
    });
  });

  describe('manual controls', () => {
    it('allows manual circuit reset', async () => {
      const mockIncrementSW = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        circuitBreakerThreshold: 1,
        fallbackStrategy: 'deny',
      });

      // Open circuit
      const result1 = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result1[0]).toBe(0); // denied

      expect(adapter.getCircuitState()).toBe('open');

      // Reset circuit
      adapter.resetCircuit();
      expect(adapter.getCircuitState()).toBe('closed');

      // Should try again
      mockIncrementSW.mockResolvedValueOnce([1, 5, 10, 1000]);
      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result).toEqual([1, 5, 10, 1000]);
    });

    it('allows cache clearing', async () => {
      const mockIncrementSW = vi
        .fn()
        .mockResolvedValueOnce([1, 5, 10, 1000])
        .mockRejectedValue(new Error('Redis down'));

      mockStore.incrementSW = mockIncrementSW;

      adapter = new ResilientRedisAdapter(mockStore, {
        retryAttempts: 1,
        fallbackStrategy: 'deny',
        cacheSize: 10,
        cacheTTL: 5000,
      });

      // Cache a result
      await adapter.incrementSW('test-key', 60000, 100, Date.now());

      // Clear cache
      adapter.clearCache();

      // Should return deny response (no cache)
      const result = await adapter.incrementSW('test-key', 60000, 100, Date.now());
      expect(result).toEqual([0, 100, 60000]);
    });
  });
});
