import { describe, expect, it, vi } from 'vitest';
import { ConfigValidator } from './ConfigValidator';
import { LimiterStrategy, Methods } from '../utils/types';
import { createMockRedis } from '../utils/test-types';

describe('ConfigValidator', () => {
  const validator = new ConfigValidator();

  const mockRedis = () => createMockRedis({});

  describe('validate', () => {
    it('accepts valid configuration', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        store: mockRedis,
      };

      const result = validator.validate(config);
      expect(result).toEqual(config);
    });

    it('throws error if store is missing', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
      };

      expect(() => validator.validate(config as any)).toThrow('store function is required');
    });

    it('throws error if store is not a function', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        store: 'not-a-function',
      };

      expect(() => validator.validate(config as any)).toThrow('store function is required');
    });

    it('throws error for non-positive limit', () => {
      const config = {
        limit: 0,
        timeFrame: 60000,
        store: mockRedis,
      };

      expect(() => validator.validate(config)).toThrow('limit must be positive');
    });

    it('throws error for non-positive timeFrame', () => {
      const config = {
        limit: 100,
        timeFrame: 0,
        store: mockRedis,
      };

      expect(() => validator.validate(config)).toThrow('timeFrame must be positive');
    });

    it('sets default burst for GCRA strategy', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = {
        limit: 100,
        timeFrame: 60000,
        strategy: LimiterStrategy.GCRA,
        store: mockRedis,
      };

      const result = validator.validate(config);
      expect(result.burst).toBe(3);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GCRA strategy without burst'),
      );

      consoleSpy.mockRestore();
    });

    it('validates routes', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        routes: [
          {
            path: '/api/test',
            method: Methods.GET,
            limit: 50,
            timeFrame: 30000,
          },
        ],
        store: mockRedis,
      };

      const result = validator.validate(config);
      expect(result.routes).toEqual(config.routes);
    });

    it('throws error for route without path', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        routes: [
          {
            method: Methods.GET,
            limit: 50,
          },
        ],
        store: mockRedis,
      };

      expect(() => validator.validate(config as any)).toThrow('Route 0 missing path');
    });

    it('validates bucket key resolver', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        bucketKeyResolver: (req: any) => req.apiKey,
        store: mockRedis,
      };

      const result = validator.validate(config);
      expect(result.bucketKeyResolver).toBe(config.bucketKeyResolver);
    });

    it('throws error for invalid bucket key resolver', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        bucketKeyResolver: 'not-a-function',
        store: mockRedis,
      };

      expect(() => validator.validate(config as any)).toThrow(
        'bucketKeyResolver must be a function',
      );
    });
  });

  describe('getRecommendations', () => {
    it('suggests reasonable limit', () => {
      const config = {
        limit: 10000,
        timeFrame: 60000,
        store: mockRedis,
      };

      const recommendations = validator.getRecommendations(config);
      expect(recommendations).toContain(
        'Consider setting a reasonable default limit (e.g., 100-500 requests)',
      );
    });

    it('warns about short timeFrame', () => {
      const config = {
        limit: 100,
        timeFrame: 500,
        store: mockRedis,
      };

      const recommendations = validator.getRecommendations(config);
      expect(recommendations).toContain(
        'TimeFrame seems very short, consider using at least 1000ms',
      );
    });

    it('suggests failOpenOnStoreError', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        store: mockRedis,
      };

      const recommendations = validator.getRecommendations(config);
      expect(recommendations).toContain(
        'Consider enabling failOpenOnStoreError for better availability',
      );
    });

    it('warns about large burst', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        strategy: LimiterStrategy.GCRA,
        burst: 200,
        store: mockRedis,
      };

      const recommendations = validator.getRecommendations(config);
      expect(recommendations).toContain('Burst should typically be smaller than the limit');
    });

    it('warns about too many routes', () => {
      const config = {
        limit: 100,
        timeFrame: 60000,
        routes: Array(60).fill({ path: '/test', method: Methods.GET }),
        store: mockRedis,
      };

      const recommendations = validator.getRecommendations(config);
      expect(recommendations).toContain(
        'Large number of routes may impact performance, consider consolidating with regex patterns',
      );
    });
  });
});
