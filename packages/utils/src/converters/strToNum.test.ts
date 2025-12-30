import { describe, expect, it } from 'vitest';
import { strToNum } from './strToNum';

describe('strToNum', () => {
  it('should convert a single character string to a number', () => {
    const str = 'a';
    const num = strToNum(str);
    expect(num).toBe(36);
  });

  it('should convert a multi-character string to a number', () => {
    const str = '10';
    const num = strToNum(str);
    expect(num).toBe(62);
  });

  it('should handle strings with numbers', () => {
    const str = '1a';
    const num = strToNum(str);
    expect(num).toBe(98);
  });

  it('should handle longer strings', () => {
    const str = 'hello';
    const num = strToNum(str);
    expect(num).toBe(645099200);
  });
});
