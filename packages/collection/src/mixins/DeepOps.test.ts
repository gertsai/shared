import { describe, expect, it } from 'vitest';
import { createMutableCollection } from '../core/createCollection';
import { MutableCollection } from '../core/MutableCollection';
import { InvalidArgumentError } from '../errors';
import { withDeepOps } from './DeepOps';

describe('DeepOps', () => {
  it('getIn/setIn/updateIn/deleteIn work for nested maps/objects', () => {
    const c = createMutableCollection<string, unknown>([
      ['a', new Map([['x', { y: { z: 1 } }]])],
      ['b', { arr: [1, 2, 3] }],
    ]);

    // getIn
    const z = (c as any).getIn(['a', 'x', 'y', 'z']);
    expect(z).toBe(1);

    // setIn on deep path
    const c2 = (c as any).setIn(['a', 'x', 'y', 'z'], 42);
    // verify via plain access (setIn returns fresh collection without deep mixins on the instance)
    const a2 = c2.get('a') as Map<string, unknown>;
    const x2 = a2.get('x') as { y: { z: unknown } };
    expect(x2.y.z).toBe(42);

    // updateIn (on the original collection since a new instance may not carry mixin methods)
    const c3 = (c as any).updateIn(['b', 'arr', 1], (v: number) => v * 10);
    const b3 = c3.get('b') as { arr: number[] };
    expect(b3.arr[1]).toBe(20);

    // deleteIn
    const c4 = (c as any).deleteIn(['a', 'x', 'y', 'z']);
    const a4 = c4.get('a') as Map<string, unknown> | undefined;
    if (a4 instanceof Map) {
      const x4 = a4.get('x') as { y?: { z?: unknown } } | undefined;
      const z4 = x4 && x4.y ? (x4.y as any).z : undefined;
      expect(z4).toBeUndefined();
    } else {
      // Entire 'a' branch could be removed depending on structure
      expect(a4).toBeUndefined();
    }
  });

  it('edges: getIn missing path, setIn creates intermediates, deleteIn missing path is no-op', () => {
    const c = createMutableCollection<string, any>([['root', {}]]);
    // missing getIn -> undefined
    expect((c as any).getIn(['root', 'missing', 'path'])).toBeUndefined();

    // setIn creates intermediate objects
    const c2 = (c as any).setIn(['root', 'mid', 'leaf'], 7);
    expect((c2.get('root') as any).mid.leaf).toBe(7);

    // deleteIn missing path should not throw and keep structure
    const c2wrapped = createMutableCollection<string, any>(c2 as any);
    const c3 = (c2wrapped as any).deleteIn(['root', 'missing', 'x']);
    expect((c3.get('root') as any).mid.leaf).toBe(7);
  });

  it('mergeDeep correctly merges nested structures', () => {
    const c1 = createMutableCollection<string, any>([
      ['a', { x: 1, y: { z: 2 } }],
      ['b', new Map([['k1', 10]])],
    ]);

    const c2 = new Map<string, any>([
      ['a', { x: 10, y: { w: 3 }, v: 4 }],
      ['b', new Map([['k2', 20]])],
      ['c', { p: 5 }],
    ]);

    const merged = (c1 as any).mergeDeep(c2);

    const valA = merged.get('a');
    expect(valA).toEqual({ x: 10, y: { z: 2, w: 3 }, v: 4 });

    const valB = merged.get('b');
    expect(valB).toBeInstanceOf(Map);
    expect(valB.get('k1')).toBe(10);
    expect(valB.get('k2')).toBe(20);

    expect(merged.get('c')).toEqual({ p: 5 });
  });

  it('mergeDeepWith uses custom merger function', () => {
    const c1 = createMutableCollection<string, any>([['a', { x: 1, y: 2 }]]);
    const c2 = new Map<string, any>([['a', { x: 10, z: 3 }]]);

    const merger = (existing: any, incoming: any) => {
      if (typeof existing === 'number' && typeof incoming === 'number') {
        return existing + incoming; // Sum numbers
      }
      return incoming; // Otherwise, incoming wins
    };

    const merged = (c1 as any).mergeDeepWith(merger, c2);
    const valA = merged.get('a');
    expect(valA).toEqual({ x: 11, y: 2, z: 3 });
  });

  describe('DeepOps compactArrays option', () => {
    it('deleteIn with compactArrays=false leaves undefined holes in arrays', () => {
      // Create collection without compactArrays (default)
      const base = new MutableCollection<string, any>([['data', { items: [1, 2, 3, 4, 5] }]]);
      const c = withDeepOps(
        base,
        (es: Iterable<[string, any]>) => new MutableCollection(es),
      ) as any;

      // Delete middle element without compacting
      const c2 = c.deleteIn(['data', 'items', 2]);
      const items = (c2.get('data') as any).items;

      expect(items.length).toBe(5);
      expect(items[2]).toBeUndefined();
      expect(items).toEqual([1, 2, undefined, 4, 5]);
    });

    it('deleteIn with compactArrays=true removes undefined elements from arrays', () => {
      // Create collection with compactArrays enabled
      const base = new MutableCollection<string, any>([['data', { items: [1, 2, 3, 4, 5] }]]);
      const c = withDeepOps(
        base,
        (es: Iterable<[string, any]>) => new MutableCollection(es),
        false,
        { compactArrays: true },
      ) as any;

      // Delete middle element with compacting
      const c2 = c.deleteIn(['data', 'items', 2]);
      const items = (c2.get('data') as any).items;

      expect(items.length).toBe(4);
      expect(items).toEqual([1, 2, 4, 5]);
      expect(items[2]).toBe(4); // Element shifted
    });

    it('deleteIn with nested arrays and compactArrays=true', () => {
      const base = new MutableCollection<string, any>([
        [
          'nested',
          {
            level1: [
              { id: 1, values: ['a', 'b', 'c'] },
              { id: 2, values: ['d', 'e', 'f'] },
            ],
          },
        ],
      ]);
      const c = withDeepOps(
        base,
        (es: Iterable<[string, any]>) => new MutableCollection(es),
        false,
        { compactArrays: true },
      ) as any;

      // Delete nested array element with compacting
      const c2 = c.deleteIn(['nested', 'level1', 0, 'values', 1]);
      const level1 = (c2.get('nested') as any).level1;

      expect(level1[0].values).toEqual(['a', 'c']);
      expect(level1[1].values).toEqual(['d', 'e', 'f']);
    });

    it('deleteIn with compactArrays handles multiple deletions', () => {
      const base = new MutableCollection<string, any>([
        ['data', { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
      ]);

      // Create a factory that preserves the DeepOps mixin
      const createNewWithDeepOps = (es: Iterable<[string, any]>) => {
        const newCol = new MutableCollection(es);
        return withDeepOps(newCol, createNewWithDeepOps, false, {
          compactArrays: true,
        });
      };

      const c = withDeepOps(base, createNewWithDeepOps, false, {
        compactArrays: true,
      }) as any;

      // Delete multiple elements (note: indices shift after each deletion with compactArrays)
      let result = c;
      result = result.deleteIn(['data', 'items', 8]); // removes 9, array becomes [1,2,3,4,5,6,7,8,10]
      result = result.deleteIn(['data', 'items', 5]); // removes 6, array becomes [1,2,3,4,5,7,8,10]
      result = result.deleteIn(['data', 'items', 2]); // removes 3, array becomes [1,2,4,5,7,8,10]

      const items = (result.get('data') as any).items;
      expect(items).toEqual([1, 2, 4, 5, 7, 8, 10]);
    });

    it('deleteIn with compactArrays=false preserves sparse arrays', () => {
      // Create collection with compactArrays=false via withDeepOps
      const base = new MutableCollection<string, any>([
        ['sparse', { arr: [1, undefined, 3, undefined, 5] }],
      ]);
      const c = withDeepOps(
        base,
        (es: Iterable<[string, any]>) => new MutableCollection(es),
        false,
        { compactArrays: false }, // Pass option to withDeepOps, not deleteIn
      );

      // Delete existing element - holes are preserved (compactArrays=false)
      const c2 = c.deleteIn(['sparse', 'arr', 2]);
      const arr = (c2.get('sparse') as any).arr;

      expect(arr.length).toBe(5);
      expect(arr).toEqual([1, undefined, undefined, undefined, 5]);
    });

    it('deleteIn with compactArrays=true on empty path segments', () => {
      const base = new MutableCollection<string, any>([
        [
          'matrix',
          [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ],
        ],
      ]);
      const c = withDeepOps(
        base,
        (es: Iterable<[string, any]>) => new MutableCollection(es),
        false,
        { compactArrays: true },
      ) as any;

      // Delete element from nested array
      const c2 = c.deleteIn(['matrix', 1, 1]);
      const matrix = c2.get('matrix') as any;

      expect(matrix[1]).toEqual([4, 6]);
      expect(matrix[0]).toEqual([1, 2, 3]);
      expect(matrix[2]).toEqual([7, 8, 9]);
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('setIn should reject __proto__ in path', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      expect(() => (c as any).setIn(['__proto__', 'polluted'], true)).toThrow(InvalidArgumentError);
      expect(() => (c as any).setIn(['a', '__proto__', 'polluted'], true)).toThrow(
        InvalidArgumentError,
      );
      // Verify Object.prototype was not polluted
      expect(({} as any).polluted).toBeUndefined();
    });

    it('setIn should reject constructor in path', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      expect(() => (c as any).setIn(['constructor', 'polluted'], true)).toThrow(
        InvalidArgumentError,
      );
      expect(() => (c as any).setIn(['a', 'constructor', 'polluted'], true)).toThrow(
        InvalidArgumentError,
      );
    });

    it('setIn should reject prototype in path', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      expect(() => (c as any).setIn(['prototype', 'polluted'], true)).toThrow(InvalidArgumentError);
      expect(() => (c as any).setIn(['a', 'prototype', 'polluted'], true)).toThrow(
        InvalidArgumentError,
      );
    });

    it('updateIn should reject unsafe keys', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      expect(() => (c as any).updateIn(['__proto__', 'isAdmin'], () => true)).toThrow(
        InvalidArgumentError,
      );
      expect(() => (c as any).updateIn(['a', 'constructor'], () => true)).toThrow(
        InvalidArgumentError,
      );
      expect(() => (c as any).updateIn(['a', 'prototype'], () => true)).toThrow(
        InvalidArgumentError,
      );
    });

    it('deleteIn should reject unsafe keys', () => {
      const c = createMutableCollection<string, unknown>([['a', { b: 1 }]]);
      expect(() => (c as any).deleteIn(['__proto__', 'polluted'])).toThrow(InvalidArgumentError);
      expect(() => (c as any).deleteIn(['a', 'constructor'])).toThrow(InvalidArgumentError);
      expect(() => (c as any).deleteIn(['a', 'prototype'])).toThrow(InvalidArgumentError);
    });

    it('mergeDeep should reject unsafe top-level keys', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      const malicious = new Map<string, unknown>([['__proto__', { polluted: true }]]);
      expect(() => (c as any).mergeDeep(malicious)).toThrow(InvalidArgumentError);
    });

    it('mergeDeep should reject unsafe nested keys in objects', () => {
      const c = createMutableCollection<string, unknown>([['a', { x: 1 }]]);
      // Use JSON.parse to create an object with __proto__ as an own property
      // (Normal JS syntax { __proto__: ... } sets the prototype, not an own property)
      const maliciousObj = JSON.parse('{"__proto__": {"polluted": true}}');
      const malicious = new Map<string, unknown>([['a', maliciousObj]]);
      expect(() => (c as any).mergeDeep(malicious)).toThrow(InvalidArgumentError);
      // Verify Object.prototype was not polluted
      expect(({} as any).polluted).toBeUndefined();
    });

    it('mergeDeep should reject unsafe keys in nested Maps', () => {
      const c = createMutableCollection<string, unknown>([['a', new Map([['safe', 1]])]]);
      const innerMap = new Map<string, unknown>([['__proto__', { polluted: true }]]);
      const malicious = new Map<string, unknown>([['a', innerMap]]);
      expect(() => (c as any).mergeDeep(malicious)).toThrow(InvalidArgumentError);
    });

    it('mergeDeepWith should reject unsafe keys', () => {
      const c = createMutableCollection<string, unknown>([['a', { x: 1 }]]);
      const merger = (_existing: any, incoming: any) => incoming;
      const malicious = new Map<string, unknown>([['__proto__', { polluted: true }]]);
      expect(() => (c as any).mergeDeepWith(merger, malicious)).toThrow(InvalidArgumentError);
    });

    it('mergeDeepWith should reject unsafe nested keys', () => {
      const c = createMutableCollection<string, unknown>([['a', { x: 1 }]]);
      const merger = (_existing: any, incoming: any) => incoming;
      // Use JSON.parse to create an object with 'constructor' as an own property
      const maliciousObj = JSON.parse('{"constructor": {"polluted": true}}');
      const malicious = new Map<string, unknown>([['a', maliciousObj]]);
      expect(() => (c as any).mergeDeepWith(merger, malicious)).toThrow(InvalidArgumentError);
    });

    it('should allow safe keys that look similar to unsafe keys', () => {
      const c = createMutableCollection<string, unknown>([['a', {}]]);
      // These should be allowed
      expect(() => (c as any).setIn(['__proto', 'safe'], true)).not.toThrow();
      expect(() => (c as any).setIn(['proto__', 'safe'], true)).not.toThrow();
      expect(() => (c as any).setIn(['_constructor', 'safe'], true)).not.toThrow();
      expect(() => (c as any).setIn(['prototyp', 'safe'], true)).not.toThrow();
    });

    it('should work normally with safe paths after blocking unsafe ones', () => {
      const c = createMutableCollection<string, unknown>([['root', { nested: { value: 1 } }]]);

      // First, verify unsafe path is blocked
      expect(() => (c as any).setIn(['root', '__proto__', 'polluted'], true)).toThrow(
        InvalidArgumentError,
      );

      // Then verify safe paths still work
      const c2 = (c as any).setIn(['root', 'nested', 'value'], 42);
      expect((c2.get('root') as any).nested.value).toBe(42);

      // Verify Object.prototype was not polluted
      expect(({} as any).polluted).toBeUndefined();
    });
  });
});
