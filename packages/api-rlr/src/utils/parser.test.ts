import { describe, expect, it } from 'vitest';
import { parseScriptResponse, toInt } from './parser';

describe('parser utilities', () => {
  describe('parseScriptResponse', () => {
    it('parses valid response array correctly', () => {
      const response = [5, 3, 1500];
      const result = parseScriptResponse(response);

      expect(result.totalHits).toBe(5);
      expect(result.remainingHits).toBe(3);
      expect(result.expiryTime).toBe(2000); // Rounds up to nearest second
    });

    it('handles zero values correctly', () => {
      const response = [0, 0, 0];
      const result = parseScriptResponse(response);

      expect(result.totalHits).toBe(0);
      expect(result.remainingHits).toBe(0);
      expect(result.expiryTime).toBe(0);
    });

    it('handles negative values as zeros', () => {
      const response = [-5, -3, -1000];
      const result = parseScriptResponse(response);

      expect(result.totalHits).toBe(0);
      expect(result.remainingHits).toBe(0);
      expect(result.expiryTime).toBe(0);
    });

    it('rounds expiry time up to nearest second', () => {
      const response = [10, 5, 2501];
      const result = parseScriptResponse(response);

      expect(result.expiryTime).toBe(3000);
    });

    it('throws error if not an array', () => {
      expect(() => parseScriptResponse('not-an-array' as any)).toThrow(
        'Expected result to be array of values',
      );

      expect(() => parseScriptResponse(null as any)).toThrow(
        'Expected result to be array of values',
      );

      expect(() => parseScriptResponse(undefined as any)).toThrow(
        'Expected result to be array of values',
      );
    });

    it('throws error if array length is not 3 or 4', () => {
      expect(() => parseScriptResponse([1, 2])).toThrow('Expected 3 or 4 replies, got 2');

      expect(() => parseScriptResponse([])).toThrow('Expected 3 or 4 replies, got 0');
    });

    it('parses 4-length response (allow flag) correctly', () => {
      const response = [1, 4, 0, 500];
      const result = parseScriptResponse(response);

      expect(result.totalHits).toBe(4);
      expect(result.remainingHits).toBe(0);
      expect(result.expiryTime).toBe(1000);
    });
  });

  describe('toInt', () => {
    it('returns number as-is', () => {
      expect(toInt(42)).toBe(42);
      expect(toInt(0)).toBe(0);
      expect(toInt(-10)).toBe(-10);
      expect(toInt(3.14)).toBe(3.14); // Note: doesn't floor, returns as-is
    });

    it('parses string numbers', () => {
      expect(toInt('42')).toBe(42);
      expect(toInt('0')).toBe(0);
      expect(toInt('-10')).toBe(-10);
      expect(toInt('3.14')).toBe(3); // parseInt behavior
    });

    it('handles boolean values', () => {
      expect(toInt(true)).toBe(NaN); // 'true' parsed as NaN
      expect(toInt(false)).toBe(NaN); // 'false' parsed as NaN
    });

    it('handles undefined and null', () => {
      expect(toInt(undefined)).toBe(NaN); // Empty string parsed as NaN
      // @ts-expect-error Testing edge case
      expect(toInt(null)).toBe(NaN); // 'null' parsed as NaN
    });

    it('handles invalid strings', () => {
      expect(toInt('not-a-number' as any)).toBe(NaN);
      expect(toInt('123abc' as any)).toBe(123); // parseInt stops at first non-digit
    });
  });
});
