import { describe, expect, it } from 'vitest';
import { getRandomId } from './getRandomId';

describe('getRandomId', () => {
  it('should return a string of the specified length', () => {
    const length = 10;
    const id = getRandomId(length);
    expect(id).toBeTypeOf('string');
    expect(id.length).toBe(length);
  });

  it('should return a different id each time', () => {
    const id1 = getRandomId(10);
    const id2 = getRandomId(10);
    expect(id1).not.toBe(id2);
  });

  it('should only contain alphanumeric characters', () => {
    const id = getRandomId(100);
    expect(id).toMatch(/^[a-zA-Z0-9]+$/);
  });
});
