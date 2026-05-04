import { describe, expect, it } from 'vitest';
import { arrayToObject } from './arrayToObject';

describe('arrayToObject', () => {
  it('should convert array to object using default id key', () => {
    const users = [
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ];

    const result = arrayToObject(users);

    expect(result).toEqual({
      '1': { id: '1', name: 'John' },
      '2': { id: '2', name: 'Jane' },
    });
  });

  it('should convert array to object using custom key', () => {
    const users = [
      { id: '1', email: 'john@example.com', name: 'John' },
      { id: '2', email: 'jane@example.com', name: 'Jane' },
    ];

    const result = arrayToObject(users, 'email');

    expect(result).toEqual({
      'john@example.com': { id: '1', email: 'john@example.com', name: 'John' },
      'jane@example.com': { id: '2', email: 'jane@example.com', name: 'Jane' },
    });
  });

  it('should merge with default values', () => {
    const users = [
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ];

    const result = arrayToObject(users, 'id', () => ({
      active: true,
      role: 'user',
    }));

    expect(result).toEqual({
      '1': { id: '1', name: 'John', active: true, role: 'user' },
      '2': { id: '2', name: 'Jane', active: true, role: 'user' },
    });
  });

  it('should handle numeric keys', () => {
    const items = [
      { id: 1, value: 'first' },
      { id: 2, value: 'second' },
    ];

    const result = arrayToObject(items);

    expect(result).toEqual({
      '1': { id: 1, value: 'first' },
      '2': { id: 2, value: 'second' },
    });
  });

  it('should handle empty array', () => {
    const result = arrayToObject([]);
    expect(result).toEqual({});
  });

  it('should handle duplicate keys by overwriting', () => {
    const users = [
      { id: '1', name: 'John', version: 1 },
      { id: '2', name: 'Jane', version: 1 },
      { id: '1', name: 'Johnny', version: 2 },
    ];

    const result = arrayToObject(users);

    expect(result).toEqual({
      '1': { id: '1', name: 'Johnny', version: 2 },
      '2': { id: '2', name: 'Jane', version: 1 },
    });
  });

  it('should merge defaults last, overriding original properties', () => {
    const users = [{ id: '1', name: 'John', active: false }];

    const result = arrayToObject(users, 'id', () => ({
      active: true,
      role: 'user',
    }));

    // The arrayToObject function spreads element first, then defaults
    // So defaults override original properties
    expect(result).toEqual({
      '1': { id: '1', name: 'John', active: true, role: 'user' },
    });
  });

  it('should handle objects with nested properties', () => {
    const users = [
      { id: '1', profile: { name: 'John', age: 30 } },
      { id: '2', profile: { name: 'Jane', age: 25 } },
    ];

    const result = arrayToObject(users);

    expect(result).toEqual({
      '1': { id: '1', profile: { name: 'John', age: 30 } },
      '2': { id: '2', profile: { name: 'Jane', age: 25 } },
    });
  });

  it('should handle undefined and null keys', () => {
    const data = [
      { id: undefined, name: 'Unknown' },
      { id: null, name: 'Null' },
      { id: '1', name: 'Valid' },
    ];

    const result = arrayToObject(data);

    expect(result).toEqual({
      undefined: { id: undefined, name: 'Unknown' },
      null: { id: null, name: 'Null' },
      '1': { id: '1', name: 'Valid' },
    });
  });

  it('should work with complex default function', () => {
    const users = [
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ];

    let counter = 0;
    const result = arrayToObject(users, 'id', () => ({
      index: counter++,
      timestamp: Date.now(),
    }));

    expect(result['1']).toMatchObject({ id: '1', name: 'John', index: 0 });
    expect(result['2']).toMatchObject({ id: '2', name: 'Jane', index: 1 });
    expect(typeof (result['1'] as any).timestamp).toBe('number');
    expect(typeof (result['2'] as any).timestamp).toBe('number');
  });
});
