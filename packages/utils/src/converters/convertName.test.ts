import { describe, expect, it } from 'vitest';
import { convertName } from './convertName';

describe('convertName', () => {
  it('should convert a full name to an object with first_name, last_name, and nickname', () => {
    const name = 'John Doe';
    const result = convertName(name);
    expect(result.first_name).toBe('John');
    expect(result.last_name).toBe('Doe');
    expect(result.nickname).toBe('john.doe');
  });

  it('should handle a single name', () => {
    const name = 'John';
    const result = convertName(name);
    expect(result.first_name).toBe('John');
    expect(result.last_name).toBe('');
    expect(result.nickname).toMatch(/^john\.[a-z]{4}$/);
  });
});
