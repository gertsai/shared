import { describe, expect, it } from 'vitest';
import { limitString } from './limitString';

describe('limitString', () => {
  it('should not change a string shorter than the limit', () => {
    const str = 'hello';
    expect(limitString(str, { length: 10 })).toBe('hello');
  });

  it('should truncate a string longer than the limit', () => {
    const str = 'hello world';
    expect(limitString(str, { length: 8, delimiter: '$$$' })).toBe('hello$$$');
  });

  it('should handle a string equal to the limit', () => {
    const str = 'hello';
    expect(limitString(str, { length: 5 })).toBe('hello');
  });

  it('should handle an empty string', () => {
    const str = '';
    expect(limitString(str, { length: 10 })).toBe('');
  });

  it('should use the default delimiter if none is provided', () => {
    const str = 'hello world';
    expect(limitString(str, { length: 8 })).toBe('hello...');
  });
});
