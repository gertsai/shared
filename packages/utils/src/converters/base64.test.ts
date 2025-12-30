import { describe, expect, it } from 'vitest';
import { decodeBase64ToString, encodeStringToBase64 } from './base64';

describe('base64 encoding and decoding', () => {
  describe('encodeStringToBase64', () => {
    it('should encode simple string to base64', () => {
      const input = 'Hello World';
      const expected = 'SGVsbG8gV29ybGQ=';
      expect(encodeStringToBase64(input)).toBe(expected);
    });

    it('should encode empty string', () => {
      const input = '';
      const expected = '';
      expect(encodeStringToBase64(input)).toBe(expected);
    });

    it('should encode string with special characters', () => {
      const input = 'Hello, 世界! 🌍';
      const result = encodeStringToBase64(input);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should encode string with numbers and symbols', () => {
      const input = '123!@#$%^&*()';
      const result = encodeStringToBase64(input);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should encode multiline string', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const result = encodeStringToBase64(input);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should encode JSON string', () => {
      const input = JSON.stringify({ name: 'John', age: 30 });
      const result = encodeStringToBase64(input);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('decodeBase64ToString', () => {
    it('should decode simple base64 string', () => {
      const input = 'SGVsbG8gV29ybGQ=';
      const expected = 'Hello World';
      expect(decodeBase64ToString(input)).toBe(expected);
    });

    it('should decode empty base64 string', () => {
      const input = '';
      const expected = '';
      expect(decodeBase64ToString(input)).toBe(expected);
    });

    it('should decode base64 with special characters', () => {
      const original = 'Hello, 世界! 🌍';
      const encoded = encodeStringToBase64(original);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(original);
    });

    it('should decode base64 with numbers and symbols', () => {
      const original = '123!@#$%^&*()';
      const encoded = encodeStringToBase64(original);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(original);
    });

    it('should decode multiline base64', () => {
      const original = 'Line 1\nLine 2\nLine 3';
      const encoded = encodeStringToBase64(original);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(original);
    });

    it('should decode JSON base64', () => {
      const original = JSON.stringify({ name: 'John', age: 30 });
      const encoded = encodeStringToBase64(original);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(original);
      expect(JSON.parse(decoded)).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('round-trip encoding/decoding', () => {
    const testStrings = [
      'Hello World',
      'The quick brown fox jumps over the lazy dog',
      '!@#$%^&*()_+-=[]{}|;:,.<>?',
      '123456789',
      'åäöüñç',
      '🚀 Space exploration 🌌',
      '\n\t\r',
      '',
    ];

    testStrings.forEach((testString) => {
      it(`should correctly encode and decode: "${testString.slice(0, 30)}${testString.length > 30 ? '...' : ''}"`, () => {
        const encoded = encodeStringToBase64(testString);
        const decoded = decodeBase64ToString(encoded);
        expect(decoded).toBe(testString);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very long strings', () => {
      const longString = 'A'.repeat(10000);
      const encoded = encodeStringToBase64(longString);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(longString);
      expect(decoded.length).toBe(10000);
    });

    it('should handle unicode characters properly', () => {
      const unicodeString = '你好世界 🎉 مرحبا بالعالم';
      const encoded = encodeStringToBase64(unicodeString);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(unicodeString);
    });

    it('should handle whitespace-only strings', () => {
      const whitespaceString = '   \n\t\r   ';
      const encoded = encodeStringToBase64(whitespaceString);
      const decoded = decodeBase64ToString(encoded);
      expect(decoded).toBe(whitespaceString);
    });
  });
});
