import { beforeEach, describe, expect, it } from 'vitest';
import { RequestContext } from './RequestContext';
import type { IncomingRequest } from '../utils/types';
import { createMockRequest } from '../utils/test-types';

describe('RequestContext', () => {
  let mockRequest: IncomingRequest;
  let context: RequestContext;

  beforeEach(() => {
    mockRequest = createMockRequest({
      method: 'GET',
      url: '/api/users',
      originalUrl: '/api/users',
      headers: {
        'x-forwarded-for': '192.168.1.1',
      },
    });

    context = new RequestContext(mockRequest);
  });

  describe('constructor', () => {
    it('initializes with basic request data', () => {
      expect(context.request).toBe(mockRequest);
      expect(context.requestId).toMatch(/^rlr_\d+_[a-z0-9]+$/);
      expect(context.get('method')).toBe('GET');
      expect(context.get('path')).toBe('/api/users');
      expect(context.get('ip')).toBe('192.168.1.1');
    });

    it('handles missing request properties', () => {
      const minimalRequest = createMockRequest({});
      const minimalContext = new RequestContext(minimalRequest);

      expect(minimalContext.get('method')).toBe('GET');
      expect(minimalContext.get('path')).toBe('');
      expect(minimalContext.get('ip')).toBeNull();
    });
  });

  describe('set/get/has', () => {
    it('stores and retrieves values', () => {
      context.set('customKey', 'customValue');

      expect(context.has('customKey')).toBe(true);
      expect(context.get('customKey')).toBe('customValue');
      expect(context.has('nonExistent')).toBe(false);
      expect(context.get('nonExistent')).toBeUndefined();
    });

    it('handles typed values', () => {
      context.set('number', 42);
      context.set('object', { foo: 'bar' });

      expect(context.get<number>('number')).toBe(42);
      expect(context.get<{ foo: string }>('object')).toEqual({ foo: 'bar' });
    });
  });

  describe('setMany', () => {
    it('sets multiple values at once', () => {
      context.setMany({
        key1: 'value1',
        key2: 'value2',
        key3: 42,
      });

      expect(context.get('key1')).toBe('value1');
      expect(context.get('key2')).toBe('value2');
      expect(context.get('key3')).toBe(42);
    });
  });

  describe('getDuration', () => {
    it('calculates duration from start time', async () => {
      const startTime = Date.now() - 100;
      const timedContext = new RequestContext(mockRequest, startTime);

      const duration = timedContext.getDuration();
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('markRateLimited', () => {
    it('marks request as rate limited with details', () => {
      context.markRateLimited({
        limit: 100,
        timeFrame: 60000,
        remaining: 0,
        retryAfter: 5000,
      });

      expect(context.get('decision')).toBe('blocked');
      expect(context.get('rateLimited')).toBe(true);
      expect(context.get('limit')).toBe(100);
      expect(context.get('timeFrame')).toBe(60000);
      expect(context.get('remaining')).toBe(0);
      expect(context.get('retryAfter')).toBe(5000);
    });
  });

  describe('markAllowed', () => {
    it('marks request as allowed with details', () => {
      context.markAllowed({
        limit: 100,
        timeFrame: 60000,
        remaining: 50,
      });

      expect(context.get('decision')).toBe('allowed');
      expect(context.get('rateLimited')).toBe(false);
      expect(context.get('limit')).toBe(100);
      expect(context.get('timeFrame')).toBe(60000);
      expect(context.get('remaining')).toBe(50);
    });
  });

  describe('markError', () => {
    it('stores error message', () => {
      const error = new Error('Test error');
      context.markError(error);

      expect(context.get('error')).toBe('Test error');
      expect(context.get('errorStack')).toContain('Error: Test error');
    });

    it('handles string errors', () => {
      context.markError('String error');

      expect(context.get('error')).toBe('String error');
      expect(context.get('errorStack')).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('serializes context to JSON', () => {
      context.setMany({
        customKey: 'customValue',
        limit: 100,
      });

      const json = context.toJSON();

      expect(json.requestId).toMatch(/^rlr_\d+_[a-z0-9]+$/);
      expect(json.duration).toBeGreaterThanOrEqual(0);
      expect(json.method).toBe('GET');
      expect(json.path).toBe('/api/users');
      expect(json.customKey).toBe('customValue');
      expect(json.limit).toBe(100);
    });
  });

  describe('getSummary', () => {
    it('returns a summary string', () => {
      context.markAllowed({
        limit: 100,
        timeFrame: 60000,
        remaining: 50,
      });

      const summary = context.getSummary();

      expect(summary).toMatch(/^\[rlr_\d+_[a-z0-9]+\] GET \/api\/users - allowed \(\d+ms\)$/);
    });

    it('shows pending when no decision', () => {
      const summary = context.getSummary();

      expect(summary).toMatch(/^\[rlr_\d+_[a-z0-9]+\] GET \/api\/users - pending \(\d+ms\)$/);
    });
  });

  describe('createChild', () => {
    it('creates a child context with copied data', () => {
      context.set('parentKey', 'parentValue');

      const child = context.createChild('child');

      expect(child.requestId).toMatch(/^rlr_\d+_[a-z0-9]+_child$/);
      expect(child.request).toBe(mockRequest);
      expect(child.get('parentKey')).toBe('parentValue');
      expect(child.get('method')).toBe('GET');
    });

    it('child modifications do not affect parent', () => {
      const child = context.createChild('child');

      child.set('childKey', 'childValue');
      context.set('parentKey', 'parentValue');

      expect(context.get('childKey')).toBeUndefined();
      expect(child.get('parentKey')).toBeUndefined();
    });
  });
});
