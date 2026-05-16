import { describe, expect, it } from 'vitest';

import {
  BrandValidationError,
  createCacheKey,
  createCollectionId,
  createHashCode,
  createSeqOperationIndex,
} from './branded';

describe('branded factories — validation', () => {
  describe('createCacheKey', () => {
    it('accepts non-empty strings', () => {
      const key = createCacheKey('user:42');
      expect(key).toBe('user:42');
    });

    it('rejects empty string and non-string with proper error metadata', () => {
      expect(() => createCacheKey('')).toThrow(BrandValidationError);
      const bad: unknown = 42;
      expect(() => createCacheKey(bad as string)).toThrow(BrandValidationError);
      try {
        createCacheKey('');
      } catch (err) {
        const ve = err as BrandValidationError;
        expect(ve).toBeInstanceOf(BrandValidationError);
        expect(ve.name).toBe('BrandValidationError');
        expect(ve.brand).toBe('CacheKey');
        expect(ve.received).toBe('');
      }
    });
  });

  describe('createCollectionId', () => {
    it('accepts default prefix', () => {
      const id = createCollectionId();
      expect(id.startsWith('col_')).toBe(true);
    });

    it('accepts custom non-empty prefix', () => {
      const id = createCollectionId('cache');
      expect(id.startsWith('cache_')).toBe(true);
    });

    it('rejects empty prefix', () => {
      expect(() => createCollectionId('')).toThrow(BrandValidationError);
    });
  });

  describe('createSeqOperationIndex', () => {
    it('accepts non-negative integers', () => {
      expect(createSeqOperationIndex(0)).toBe(0);
      expect(createSeqOperationIndex(7)).toBe(7);
    });

    it('rejects negatives, fractions, NaN and Infinity', () => {
      expect(() => createSeqOperationIndex(-1)).toThrow(BrandValidationError);
      expect(() => createSeqOperationIndex(1.5)).toThrow(BrandValidationError);
      expect(() => createSeqOperationIndex(Number.NaN)).toThrow(BrandValidationError);
      expect(() => createSeqOperationIndex(Number.POSITIVE_INFINITY)).toThrow(
        BrandValidationError,
      );
    });
  });

  describe('createHashCode', () => {
    it('accepts finite numbers including negatives and fractions', () => {
      expect(createHashCode(0)).toBe(0);
      expect(createHashCode(-1.5)).toBe(-1.5);
      expect(createHashCode(123456)).toBe(123456);
    });

    it('rejects NaN and ±Infinity', () => {
      expect(() => createHashCode(Number.NaN)).toThrow(BrandValidationError);
      expect(() => createHashCode(Number.POSITIVE_INFINITY)).toThrow(BrandValidationError);
      expect(() => createHashCode(Number.NEGATIVE_INFINITY)).toThrow(BrandValidationError);
    });
  });

  describe('BrandValidationError is re-exported from package root', () => {
    it('matches the value imported from ./branded', async () => {
      const root = await import('../index');
      expect(root.BrandValidationError).toBe(BrandValidationError);
    });
  });
});
