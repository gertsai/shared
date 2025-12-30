import { describe, expect, it } from 'vitest';
import type { Entries } from './entries';

describe('Entries type utility', () => {
  describe('basic object entries', () => {
    it('should correctly type entries of simple object', () => {
      const obj = {
        name: 'John',
        age: 30,
        active: true,
      };

      type ObjectEntries = Entries<typeof obj>;
      const entries: ObjectEntries = Object.entries(obj) as ObjectEntries;

      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual(['name', 'John']);
      expect(entries[1]).toEqual(['age', 30]);
      expect(entries[2]).toEqual(['active', true]);

      // Type checking - entries should have the correct tuple types
      entries.forEach(([key, value]) => {
        expect(typeof key).toBe('string');
        expect(['string', 'number', 'boolean']).toContain(typeof value);
      });
    });

    it('should handle objects with different value types', () => {
      const mixedObj = {
        id: 1,
        name: 'Test',
        tags: ['tag1', 'tag2'],
        metadata: { created: new Date() },
        isValid: false,
      };

      type MixedEntries = Entries<typeof mixedObj>;
      const entries: MixedEntries = Object.entries(mixedObj) as MixedEntries;

      expect(entries).toHaveLength(5);

      // Check that we can access specific entries with proper types
      const idEntry = entries.find(([key]) => key === 'id');
      expect(idEntry).toBeDefined();
      expect(idEntry![1]).toBe(1);

      const tagsEntry = entries.find(([key]) => key === 'tags');
      expect(tagsEntry).toBeDefined();
      expect(Array.isArray(tagsEntry![1])).toBe(true);
    });
  });

  describe('undefined value handling', () => {
    it('should exclude undefined values from entries type', () => {
      const objWithUndefined = {
        defined: 'value',
        maybeUndefined: undefined as string | undefined,
        alwaysUndefined: undefined,
      };

      type EntriesWithUndefined = Entries<typeof objWithUndefined>;

      // The type should only include entries where values are not undefined
      const entries: EntriesWithUndefined = [
        ['defined', 'value'],
        // Note: 'maybeUndefined' entries would have type [string, string] when present
        // 'alwaysUndefined' is excluded from the type
      ];

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(['defined', 'value']);
    });

    it('should handle optional properties correctly', () => {
      interface OptionalProps {
        required: string;
        optional?: number;
        nullable: string | null;
        maybeUndefined: string | undefined;
      }

      const obj: OptionalProps = {
        required: 'test',
        optional: 42,
        nullable: null,
        maybeUndefined: 'present',
      };

      type OptionalEntries = Entries<OptionalProps>;
      const entries: OptionalEntries = Object.entries(obj).filter(
        ([, value]) => value !== undefined,
      ) as OptionalEntries;

      // Should include all non-undefined values
      expect(entries.length).toBeGreaterThan(0);

      // Find specific entries
      const requiredEntry = entries.find(([key]) => key === 'required');
      expect(requiredEntry).toEqual(['required', 'test']);

      const nullableEntry = entries.find(([key]) => key === 'nullable');
      expect(nullableEntry).toEqual(['nullable', null]);
    });
  });

  describe('complex object structures', () => {
    it('should handle nested objects', () => {
      const nestedObj = {
        user: {
          id: 1,
          profile: {
            name: 'John',
          },
        },
        settings: {
          theme: 'dark',
        },
        count: 0,
      };

      type NestedEntries = Entries<typeof nestedObj>;
      const entries: NestedEntries = Object.entries(nestedObj) as NestedEntries;

      expect(entries).toHaveLength(3);

      // Check nested object entry
      const userEntry = entries.find(([key]) => key === 'user') as [
        'user',
        { id: number; profile: { name: string } },
      ];
      expect(userEntry).toBeDefined();
      expect(typeof userEntry![1]).toBe('object');
      expect(userEntry![1].id).toBe(1);
    });

    it('should handle arrays as values', () => {
      const objWithArrays = {
        numbers: [1, 2, 3],
        strings: ['a', 'b', 'c'],
        mixed: [1, 'two', true],
        empty: [],
      };

      type ArrayEntries = Entries<typeof objWithArrays>;
      const entries: ArrayEntries = Object.entries(
        objWithArrays,
      ) as ArrayEntries;

      expect(entries).toHaveLength(4);

      entries.forEach(([key, value]) => {
        expect(Array.isArray(value)).toBe(true);
        expect(['numbers', 'strings', 'mixed', 'empty']).toContain(key);
      });
    });

    it('should handle function values', () => {
      const objWithFunctions = {
        getName: () => 'John',
        calculate: (x: number, y: number) => x + y,
        data: 'some data',
      };

      type FunctionEntries = Entries<typeof objWithFunctions>;
      const entries: FunctionEntries = Object.entries(
        objWithFunctions,
      ) as FunctionEntries;

      expect(entries).toHaveLength(3);

      const getNameEntry = entries.find(([key]) => key === 'getName') as [
        'getName',
        () => string,
      ];
      expect(getNameEntry).toBeDefined();
      expect(typeof getNameEntry![1]).toBe('function');
      expect(getNameEntry![1]()).toBe('John');

      const calculateEntry = entries.find(([key]) => key === 'calculate') as [
        'calculate',
        (x: number, y: number) => number,
      ];
      expect(calculateEntry).toBeDefined();
      expect(typeof calculateEntry![1]).toBe('function');
      expect(calculateEntry![1](2, 3)).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const emptyObj = {};

      type EmptyEntries = Entries<typeof emptyObj>;
      const entries: EmptyEntries = Object.entries(emptyObj) as EmptyEntries;

      expect(entries).toHaveLength(0);
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should handle objects with symbol keys', () => {
      const sym = Symbol('test');
      const objWithSymbol = {
        [sym]: 'symbol value',
        regular: 'regular value',
      };

      // Note: Object.entries() doesn't include symbol keys,
      // but our type should handle the regular keys correctly
      type SymbolEntries = Entries<typeof objWithSymbol>;
      const entries: SymbolEntries = Object.entries(
        objWithSymbol,
      ) as SymbolEntries;

      expect(entries).toHaveLength(1); // Only regular key
      expect(entries[0]).toEqual(['regular', 'regular value']);
    });

    it('should handle objects with number keys', () => {
      const objWithNumberKeys = {
        0: 'zero',
        1: 'one',
        normal: 'string key',
      };

      type NumberKeyEntries = Entries<typeof objWithNumberKeys>;
      const entries: NumberKeyEntries = Object.entries(
        objWithNumberKeys,
      ) as NumberKeyEntries;

      expect(entries).toHaveLength(3);

      // Object.entries converts number keys to strings
      expect(entries).toContainEqual(['0', 'zero']);
      expect(entries).toContainEqual(['1', 'one']);
      expect(entries).toContainEqual(['normal', 'string key']);
    });

    it('should preserve literal types in keys', () => {
      const literalObj = {
        success: true,
        error: false,
        pending: true,
      } as const;

      type LiteralEntries = Entries<typeof literalObj>;
      const entries: LiteralEntries = Object.entries(
        literalObj,
      ) as LiteralEntries;

      expect(entries).toHaveLength(3);

      // Values should maintain their literal types
      entries.forEach(([key, value]) => {
        expect(['success', 'error', 'pending']).toContain(key);
        expect(typeof value).toBe('boolean');
      });
    });
  });

  describe('real-world usage scenarios', () => {
    it('should work with typical configuration objects', () => {
      const config = {
        apiUrl: 'https://api.example.com',
        timeout: 5000,
        retries: 3,
        debug: false,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      type ConfigEntries = Entries<typeof config>;
      const entries: ConfigEntries = Object.entries(config) as ConfigEntries;

      // Simulate iterating over config entries
      const processedConfig = Object.fromEntries(
        entries.map(([key, value]) => {
          // Apply some transformation based on type
          if (typeof value === 'string' && key === 'apiUrl') {
            return [key, value.toLowerCase()];
          }
          return [key, value];
        }),
      );

      expect(processedConfig.apiUrl).toBe('https://api.example.com');
      expect(processedConfig.timeout).toBe(5000);
      expect(typeof processedConfig.headers).toBe('object');
    });

    it('should work with form data objects', () => {
      interface FormData {
        username: string;
        email: string;
        age?: number;
        newsletter?: boolean;
        preferences: {
          theme: 'light' | 'dark';
          notifications: boolean;
        };
      }

      const formData: FormData = {
        username: 'johndoe',
        email: 'john@example.com',
        age: 25,
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      };

      type FormEntries = Entries<FormData>;
      const entries: FormEntries = Object.entries(formData) as FormEntries;

      // Simulate form validation
      const validationResults = entries.map(([key, value]) => {
        let isValid = true;
        let message = '';

        if (key === 'email' && typeof value === 'string') {
          isValid = value.includes('@');
          message = isValid ? '' : 'Invalid email format';
        }

        return { key, value, isValid, message };
      });

      expect(validationResults).toHaveLength(4);
      const emailValidation = validationResults.find((r) => r.key === 'email');
      expect(emailValidation?.isValid).toBe(true);
    });
  });
});
