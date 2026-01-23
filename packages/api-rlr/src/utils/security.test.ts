import { describe, expect, it } from 'vitest';

import { isWhitelisted, safeStringEquals } from './security';

describe('security utilities', () => {
  describe('safeStringEquals', () => {
    it('returns true for equal strings', () => {
      expect(safeStringEquals('test', 'test')).toBe(true);
      expect(safeStringEquals('192.168.1.1', '192.168.1.1')).toBe(true);
      expect(safeStringEquals('api-key-12345', 'api-key-12345')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(safeStringEquals('test', 'test2')).toBe(false);
      expect(safeStringEquals('192.168.1.1', '192.168.1.2')).toBe(false);
      expect(safeStringEquals('api-key-12345', 'api-key-67890')).toBe(false);
    });

    it('returns false for strings of different lengths', () => {
      expect(safeStringEquals('short', 'longer')).toBe(false);
      expect(safeStringEquals('a', 'aa')).toBe(false);
      expect(safeStringEquals('', 'x')).toBe(false);
    });

    it('handles empty strings', () => {
      expect(safeStringEquals('', '')).toBe(true);
    });

    it('handles unicode strings', () => {
      expect(safeStringEquals('тест', 'тест')).toBe(true);
      expect(safeStringEquals('тест', 'test')).toBe(false);
    });
  });

  describe('isWhitelisted', () => {
    it('returns true when value is in whitelist', () => {
      const whitelist = ['192.168.1.1', '10.0.0.1', '127.0.0.1'];
      expect(isWhitelisted('192.168.1.1', whitelist)).toBe(true);
      expect(isWhitelisted('10.0.0.1', whitelist)).toBe(true);
      expect(isWhitelisted('127.0.0.1', whitelist)).toBe(true);
    });

    it('returns false when value is not in whitelist', () => {
      const whitelist = ['192.168.1.1', '10.0.0.1', '127.0.0.1'];
      expect(isWhitelisted('192.168.1.2', whitelist)).toBe(false);
      expect(isWhitelisted('8.8.8.8', whitelist)).toBe(false);
    });

    it('returns false for empty whitelist', () => {
      expect(isWhitelisted('192.168.1.1', [])).toBe(false);
    });

    it('returns false for undefined whitelist', () => {
      expect(isWhitelisted('192.168.1.1', undefined as unknown as string[])).toBe(false);
    });

    it('handles single-item whitelist', () => {
      expect(isWhitelisted('admin', ['admin'])).toBe(true);
      expect(isWhitelisted('user', ['admin'])).toBe(false);
    });

    it('handles large whitelist', () => {
      const largeWhitelist = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      expect(isWhitelisted('item-500', largeWhitelist)).toBe(true);
      expect(isWhitelisted('item-9999', largeWhitelist)).toBe(false);
    });
  });
});
