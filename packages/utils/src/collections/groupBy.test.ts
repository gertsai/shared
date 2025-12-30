import { describe, expect, it } from 'vitest';
import { groupBy } from './groupBy';

describe('groupBy', () => {
  it('should group elements by default id key', () => {
    const data = [
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
      { id: '1', name: 'Joe' },
    ];

    const result = groupBy(data);

    expect(result).toEqual({
      '1': [
        { id: '1', name: 'John' },
        { id: '1', name: 'Joe' },
      ],
      '2': [{ id: '2', name: 'Jane' }],
    });
  });

  it('should group elements by custom key', () => {
    const data = [
      { id: '1', category: 'A' },
      { id: '2', category: 'B' },
      { id: '3', category: 'A' },
    ];

    const result = groupBy(data, 'category');

    expect(result).toEqual({
      A: [
        { id: '1', category: 'A' },
        { id: '3', category: 'A' },
      ],
      B: [{ id: '2', category: 'B' }],
    });
  });

  it('should handle nested keys using lodash.get', () => {
    const data = [
      { id: '1', user: { role: 'admin' } },
      { id: '2', user: { role: 'user' } },
      { id: '3', user: { role: 'admin' } },
    ];

    const result = groupBy(data, 'user.role');

    expect(result).toEqual({
      admin: [
        { id: '1', user: { role: 'admin' } },
        { id: '3', user: { role: 'admin' } },
      ],
      user: [{ id: '2', user: { role: 'user' } }],
    });
  });

  it('should handle empty arrays', () => {
    const result = groupBy([]);
    expect(result).toEqual({});
  });

  it('should handle objects with undefined values for the grouping key', () => {
    const data = [
      { id: '1', name: 'John' },
      { id: undefined, name: 'Unknown' },
      { id: '1', name: 'Jane' },
    ];

    const result = groupBy(data);

    expect(result).toEqual({
      '1': [
        { id: '1', name: 'John' },
        { id: '1', name: 'Jane' },
      ],
      undefined: [{ id: undefined, name: 'Unknown' }],
    });
  });

  it('should handle null values for the grouping key', () => {
    const data = [
      { id: '1', name: 'John' },
      { id: null, name: 'Unknown' },
      { id: '1', name: 'Jane' },
    ];

    const result = groupBy(data);

    expect(result).toEqual({
      '1': [
        { id: '1', name: 'John' },
        { id: '1', name: 'Jane' },
      ],
      null: [{ id: null, name: 'Unknown' }],
    });
  });

  it('should handle numeric keys', () => {
    const data = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
      { id: 1, name: 'Joe' },
    ];

    const result = groupBy(data);

    expect(result).toEqual({
      '1': [
        { id: 1, name: 'John' },
        { id: 1, name: 'Joe' },
      ],
      '2': [{ id: 2, name: 'Jane' }],
    });
  });

  it('should handle mixed data types', () => {
    const data = [
      { type: 'string', value: 'hello' },
      { type: 'number', value: 42 },
      { type: 'boolean', value: true },
      { type: 'string', value: 'world' },
    ];

    const result = groupBy(data, 'type');

    expect(result).toEqual({
      string: [
        { type: 'string', value: 'hello' },
        { type: 'string', value: 'world' },
      ],
      number: [{ type: 'number', value: 42 }],
      boolean: [{ type: 'boolean', value: true }],
    });
  });
});
