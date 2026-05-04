/**
 * Tests for ReconnectStrategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReconnectStrategy } from '../reconnect.js';

describe('ReconnectStrategy', () => {
  describe('default options', () => {
    let strategy: ReconnectStrategy;

    beforeEach(() => {
      strategy = new ReconnectStrategy();
    });

    it('should be enabled by default', () => {
      expect(strategy.isEnabled()).toBe(true);
    });

    it('should have 5 max attempts by default', () => {
      expect(strategy.getMaxAttempts()).toBe(5);
    });

    it('should allow reconnection initially', () => {
      expect(strategy.shouldReconnect()).toBe(true);
    });

    it('should start with 0 attempts', () => {
      expect(strategy.getAttempts()).toBe(0);
    });

    it('should have 5 remaining attempts initially', () => {
      expect(strategy.getRemainingAttempts()).toBe(5);
    });
  });

  describe('shouldReconnect', () => {
    it('should return false when disabled', () => {
      const strategy = new ReconnectStrategy({ enabled: false });
      expect(strategy.shouldReconnect()).toBe(false);
    });

    it('should return false after max attempts', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 3 });

      strategy.recordAttempt();
      expect(strategy.shouldReconnect()).toBe(true);

      strategy.recordAttempt();
      expect(strategy.shouldReconnect()).toBe(true);

      strategy.recordAttempt();
      expect(strategy.shouldReconnect()).toBe(false);
    });
  });

  describe('getDelay', () => {
    it('should return initial delay for first attempt', () => {
      const strategy = new ReconnectStrategy({
        delay: 1000,
        factor: 2,
        jitter: false,
      });

      // First attempt (attempts = 0)
      expect(strategy.getDelay()).toBe(1000);
    });

    it('should use exponential backoff', () => {
      const strategy = new ReconnectStrategy({
        delay: 1000,
        factor: 2,
        jitter: false,
      });

      // First attempt: 1000 * 2^0 = 1000
      expect(strategy.getDelay()).toBe(1000);

      strategy.recordAttempt();
      // Second attempt: 1000 * 2^1 = 2000
      expect(strategy.getDelay()).toBe(2000);

      strategy.recordAttempt();
      // Third attempt: 1000 * 2^2 = 4000
      expect(strategy.getDelay()).toBe(4000);
    });

    it('should cap at maxDelay', () => {
      const strategy = new ReconnectStrategy({
        delay: 1000,
        factor: 2,
        maxDelay: 5000,
        jitter: false,
      });

      // After many attempts, should cap at 5000
      for (let i = 0; i < 10; i++) {
        strategy.recordAttempt();
      }

      expect(strategy.getDelay()).toBe(5000);
    });

    it('should add jitter when enabled', () => {
      const strategy = new ReconnectStrategy({
        delay: 1000,
        factor: 1,
        jitter: true,
      });

      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(strategy.getDelay());
      }

      // With jitter, should have some variation
      expect(delays.size).toBeGreaterThan(1);
    });

    it('should be consistent without jitter', () => {
      const strategy = new ReconnectStrategy({
        delay: 1000,
        factor: 1,
        jitter: false,
      });

      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(strategy.getDelay());
      }

      // Without jitter, should always be the same
      expect(delays.size).toBe(1);
    });
  });

  describe('recordAttempt', () => {
    it('should increment attempt count', () => {
      const strategy = new ReconnectStrategy();

      expect(strategy.getAttempts()).toBe(0);

      strategy.recordAttempt();
      expect(strategy.getAttempts()).toBe(1);

      strategy.recordAttempt();
      expect(strategy.getAttempts()).toBe(2);
    });

    it('should update last attempt time', () => {
      const strategy = new ReconnectStrategy();

      expect(strategy.getTimeSinceLastAttempt()).toBe(0);

      strategy.recordAttempt();
      const time1 = strategy.getTimeSinceLastAttempt();
      expect(time1).toBeGreaterThanOrEqual(0);
      expect(time1).toBeLessThan(100);
    });

    it('should decrease remaining attempts', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 3 });

      expect(strategy.getRemainingAttempts()).toBe(3);

      strategy.recordAttempt();
      expect(strategy.getRemainingAttempts()).toBe(2);

      strategy.recordAttempt();
      expect(strategy.getRemainingAttempts()).toBe(1);

      strategy.recordAttempt();
      expect(strategy.getRemainingAttempts()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset attempt count to 0', () => {
      const strategy = new ReconnectStrategy();

      strategy.recordAttempt();
      strategy.recordAttempt();
      expect(strategy.getAttempts()).toBe(2);

      strategy.reset();
      expect(strategy.getAttempts()).toBe(0);
    });

    it('should reset last attempt time', () => {
      const strategy = new ReconnectStrategy();

      strategy.recordAttempt();
      expect(strategy.getTimeSinceLastAttempt()).toBeGreaterThanOrEqual(0);

      strategy.reset();
      expect(strategy.getTimeSinceLastAttempt()).toBe(0);
    });

    it('should restore shouldReconnect to true', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 2 });

      strategy.recordAttempt();
      strategy.recordAttempt();
      expect(strategy.shouldReconnect()).toBe(false);

      strategy.reset();
      expect(strategy.shouldReconnect()).toBe(true);
    });
  });

  describe('custom options', () => {
    it('should respect custom maxAttempts', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 10 });
      expect(strategy.getMaxAttempts()).toBe(10);
    });

    it('should respect custom factor', () => {
      const strategy = new ReconnectStrategy({
        delay: 100,
        factor: 3,
        jitter: false,
      });

      expect(strategy.getDelay()).toBe(100);

      strategy.recordAttempt();
      expect(strategy.getDelay()).toBe(300); // 100 * 3^1

      strategy.recordAttempt();
      expect(strategy.getDelay()).toBe(900); // 100 * 3^2
    });
  });
});
