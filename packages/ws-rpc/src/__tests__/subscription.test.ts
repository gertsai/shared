/**
 * Tests for SubscriptionManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SubscriptionManager,
  InvalidSubscriptionPatternError,
  MAX_DOUBLE_STAR_SEGMENTS,
} from '../subscription.js';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  describe('subscribe', () => {
    it('should return unique subscription ID', () => {
      const id1 = manager.subscribe('topic1', vi.fn());
      const id2 = manager.subscribe('topic2', vi.fn());

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^sub_\d+_\d+$/);
      expect(id2).toMatch(/^sub_\d+_\d+$/);
    });

    it('should increment subscription count', () => {
      expect(manager.size).toBe(0);

      manager.subscribe('topic1', vi.fn());
      expect(manager.size).toBe(1);

      manager.subscribe('topic2', vi.fn());
      expect(manager.size).toBe(2);
    });

    it('should allow multiple subscriptions to same topic', () => {
      manager.subscribe('topic', vi.fn());
      manager.subscribe('topic', vi.fn());

      expect(manager.size).toBe(2);
      expect(manager.getByTopic('topic')).toHaveLength(2);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscription by ID', () => {
      const id = manager.subscribe('topic', vi.fn());
      expect(manager.size).toBe(1);

      const result = manager.unsubscribe(id);
      expect(result).toBe(true);
      expect(manager.size).toBe(0);
    });

    it('should return false for unknown ID', () => {
      const result = manager.unsubscribe('unknown_id');
      expect(result).toBe(false);
    });

    it('should not affect other subscriptions', () => {
      const id1 = manager.subscribe('topic1', vi.fn());
      const id2 = manager.subscribe('topic2', vi.fn());

      manager.unsubscribe(id1);

      expect(manager.size).toBe(1);
      expect(manager.has(id1)).toBe(false);
      expect(manager.has(id2)).toBe(true);
    });
  });

  describe('unsubscribeAll', () => {
    it('should remove all subscriptions for topic', () => {
      manager.subscribe('topic', vi.fn());
      manager.subscribe('topic', vi.fn());
      manager.subscribe('other', vi.fn());

      const count = manager.unsubscribeAll('topic');

      expect(count).toBe(2);
      expect(manager.size).toBe(1);
      expect(manager.getByTopic('topic')).toHaveLength(0);
    });

    it('should return 0 for unknown topic', () => {
      const count = manager.unsubscribeAll('unknown');
      expect(count).toBe(0);
    });
  });

  describe('dispatch', () => {
    it('should call callback with data', () => {
      const callback = vi.fn();
      manager.subscribe('topic', callback);

      manager.dispatch('topic', { value: 42 });

      expect(callback).toHaveBeenCalledWith({ value: 42 });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call all matching callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.subscribe('topic', callback1);
      manager.subscribe('topic', callback2);

      manager.dispatch('topic', 'data');

      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    it('should not call non-matching callbacks', () => {
      const callback = vi.fn();
      manager.subscribe('other', callback);

      manager.dispatch('topic', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return number of callbacks invoked', () => {
      manager.subscribe('topic', vi.fn());
      manager.subscribe('topic', vi.fn());
      manager.subscribe('other', vi.fn());

      const count = manager.dispatch('topic', 'data');
      expect(count).toBe(2);
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const okCallback = vi.fn();

      manager.subscribe('topic', errorCallback);
      manager.subscribe('topic', okCallback);

      // Should not throw
      const count = manager.dispatch('topic', 'data');

      expect(count).toBe(2);
      expect(okCallback).toHaveBeenCalled();
    });
  });

  describe('wildcard matching', () => {
    it('should match single wildcard (*)', () => {
      const callback = vi.fn();
      manager.subscribe('user.*', callback);

      manager.dispatch('user.created', { id: 1 });
      manager.dispatch('user.updated', { id: 2 });

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, { id: 1 });
      expect(callback).toHaveBeenNthCalledWith(2, { id: 2 });
    });

    it('should not match with single wildcard across levels', () => {
      const callback = vi.fn();
      manager.subscribe('user.*', callback);

      manager.dispatch('user.profile.updated', { id: 1 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should match double wildcard (**)', () => {
      const callback = vi.fn();
      manager.subscribe('user.**', callback);

      manager.dispatch('user.created', { id: 1 });
      manager.dispatch('user.profile.updated', { id: 2 });
      manager.dispatch('user.profile.avatar.changed', { id: 3 });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should match wildcard in middle', () => {
      const callback = vi.fn();
      manager.subscribe('api.*.response', callback);

      manager.dispatch('api.users.response', 'data');

      expect(callback).toHaveBeenCalledWith('data');
    });

    it('should not match when pattern is longer', () => {
      const callback = vi.fn();
      manager.subscribe('user.profile.*', callback);

      manager.dispatch('user.profile', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle exact match with wildcard subscriptions', () => {
      const exactCallback = vi.fn();
      const wildcardCallback = vi.fn();

      manager.subscribe('user.created', exactCallback);
      manager.subscribe('user.*', wildcardCallback);

      manager.dispatch('user.created', 'data');

      expect(exactCallback).toHaveBeenCalledWith('data');
      expect(wildcardCallback).toHaveBeenCalledWith('data');
    });
  });

  describe('getMatchingSubscriptions', () => {
    it('should return all matching subscriptions', () => {
      manager.subscribe('user.created', vi.fn());
      manager.subscribe('user.*', vi.fn());
      manager.subscribe('other', vi.fn());

      const matching = manager.getMatchingSubscriptions('user.created');

      expect(matching).toHaveLength(2);
    });

    it('should return empty array for no matches', () => {
      manager.subscribe('other', vi.fn());

      const matching = manager.getMatchingSubscriptions('user.created');

      expect(matching).toHaveLength(0);
    });
  });

  describe('getTopics', () => {
    it('should return unique topics', () => {
      manager.subscribe('topic1', vi.fn());
      manager.subscribe('topic1', vi.fn());
      manager.subscribe('topic2', vi.fn());

      const topics = manager.getTopics();

      expect(topics).toHaveLength(2);
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
    });

    it('should return empty array when no subscriptions', () => {
      const topics = manager.getTopics();
      expect(topics).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should remove all subscriptions', () => {
      manager.subscribe('topic1', vi.fn());
      manager.subscribe('topic2', vi.fn());
      expect(manager.size).toBe(2);

      manager.clear();

      expect(manager.size).toBe(0);
    });
  });

  describe('has and get', () => {
    it('should return subscription by ID', () => {
      const callback = vi.fn();
      const id = manager.subscribe('topic', callback);

      const sub = manager.get(id);

      expect(sub).toBeDefined();
      expect(sub?.topic).toBe('topic');
      expect(sub?.callback).toBe(callback);
    });

    it('should return undefined for unknown ID', () => {
      const sub = manager.get('unknown');
      expect(sub).toBeUndefined();
    });

    it('should check existence with has', () => {
      const id = manager.subscribe('topic', vi.fn());

      expect(manager.has(id)).toBe(true);
      expect(manager.has('unknown')).toBe(false);
    });
  });

  // FR-W2 (EVID-076 H-WS-2) — wildcardMatch ReDoS protection.
  describe('DoS protection (FR-W2)', () => {
    it('accepts legitimate patterns with up to MAX_DOUBLE_STAR_SEGMENTS **', () => {
      // Sanity: the cap allows realistic patterns (one or two `**`).
      expect(() => manager.subscribe('a.**.b', vi.fn())).not.toThrow();
      expect(() => manager.subscribe('a.**.b.**.c', vi.fn())).not.toThrow();
      expect(MAX_DOUBLE_STAR_SEGMENTS).toBeGreaterThanOrEqual(2);
    });

    it('rejects patterns with more than MAX_DOUBLE_STAR_SEGMENTS **', () => {
      // 10 `**` segments is exponential fan-out for the recursive matcher;
      // we reject at subscribe time so the dispatch path never sees it.
      const adversarial = Array(10).fill('**').join('.');
      expect(() => manager.subscribe(adversarial, vi.fn())).toThrow(
        InvalidSubscriptionPatternError,
      );
    });

    it('rejects patterns with absurd segment counts', () => {
      // 200 segments — far beyond any legitimate topic hierarchy.
      const huge = Array(200).fill('x').join('.');
      expect(() => manager.subscribe(huge, vi.fn())).toThrow(
        InvalidSubscriptionPatternError,
      );
    });

    it('safely bails on deep wildcard recursion without hanging', () => {
      // Subscribe with a legitimate `**` pattern, then dispatch a deeply
      // segmented topic. The matcher's depth bound must return false
      // rather than recurse indefinitely.
      const callback = vi.fn();
      manager.subscribe('a.**.z', callback);
      const longTopic = 'a.' + Array(50).fill('mid').join('.') + '.z';

      // Time-bound the dispatch to catch any DoS regression — a runaway
      // recursive matcher would blow the call stack or take seconds.
      const t0 = Date.now();
      manager.dispatch(longTopic, { x: 1 });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(500);
    });

    it('subscribe with the maximum allowed ** count succeeds', () => {
      const pattern = Array(MAX_DOUBLE_STAR_SEGMENTS)
        .fill('**')
        .join('.');
      expect(() => manager.subscribe(pattern, vi.fn())).not.toThrow();
    });
  });
});
