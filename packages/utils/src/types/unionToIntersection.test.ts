import { describe, expect, it } from 'vitest';
import type { FlattenObject, UnionToIntersection } from './unionToIntersection';

describe('unionToIntersection types', () => {
  describe('UnionToIntersection', () => {
    it('should convert union of objects to intersection', () => {
      type Union = { a: string } | { b: number };
      type Intersection = UnionToIntersection<Union>;

      // This type should have both properties
      const intersected: Intersection = { a: 'test', b: 42 };

      expect(intersected.a).toBe('test');
      expect(intersected.b).toBe(42);
    });

    it('should handle union of functions', () => {
      type FunctionUnion = ((x: string) => void) | ((x: number) => void);
      type FunctionIntersection = UnionToIntersection<FunctionUnion>;

      // The intersection should accept both string and number
      const intersectedFunction: FunctionIntersection = (
        x: string | number,
      ) => {
        // Implementation that handles both types
        if (typeof x === 'string') {
          expect(typeof x).toBe('string');
        } else {
          expect(typeof x).toBe('number');
        }
      };

      intersectedFunction('test');
      intersectedFunction(42);
    });

    it('should handle more complex union types', () => {
      type ComplexUnion = { name: string } | { id: number } | { role: string };

      type ComplexIntersection = UnionToIntersection<ComplexUnion>;

      // The intersection should require all properties
      const complex: ComplexIntersection = {
        name: 'John',
        id: 1,
        role: 'moderator',
      };

      expect(complex.name).toBe('John');
      expect(complex.id).toBe(1);
      expect(complex.role).toBe('moderator');
    });

    it('should handle primitive union types', () => {
      type PrimitiveUnion = string | number;
      type PrimitiveIntersection = UnionToIntersection<PrimitiveUnion>;

      // For primitive types, intersection typically results in never
      // This is expected behavior as string & number = never
      const checkNever = (x: PrimitiveIntersection): never => {
        return x as never;
      };

      // We can't actually create a value of type never,
      // but we can test that the type exists
      expect(typeof checkNever).toBe('function');
    });
  });

  describe('FlattenObject', () => {
    it('should flatten nested objects with concatenated keys', () => {
      type NestedType = {
        user: {
          profile: {
            name: string;
          };
          settings: {
            theme: string;
          };
        };
        app: {
          version: number;
        };
        simple: boolean;
      };

      type FlattenedType = FlattenObject<NestedType>;

      const flattened: FlattenedType = {
        'user--profile--name': 'John Doe',
        'user--settings--theme': 'dark',
        'app--version': 1,
        simple: true,
      };

      expect(flattened['user--profile--name']).toBe('John Doe');
      expect(flattened['user--settings--theme']).toBe('dark');
      expect(flattened['app--version']).toBe(1);
      expect(flattened.simple).toBe(true);
    });

    it('should handle shallow objects without nesting', () => {
      type ShallowType = {
        name: string;
        age: number;
        active: boolean;
      };

      type FlattenedType = FlattenObject<ShallowType>;

      const flattened: FlattenedType = {
        name: 'Jane',
        age: 25,
        active: true,
      };

      expect(flattened.name).toBe('Jane');
      expect(flattened.age).toBe(25);
      expect(flattened.active).toBe(true);
    });

    it('should handle empty objects', () => {
      type EmptyType = Record<string, never>;
      type FlattenedType = FlattenObject<EmptyType>;

      const flattened: FlattenedType = {};

      expect(Object.keys(flattened)).toHaveLength(0);
    });

    it('should handle objects with mixed nested and flat properties', () => {
      type MixedType = {
        id: string;
        metadata: {
          created: Date;
          tags: {
            primary: string;
            secondary: string;
          };
        };
        count: number;
      };

      type FlattenedType = FlattenObject<MixedType>;

      const now = new Date();
      const flattened: FlattenedType = {
        id: 'test-id',
        'metadata--created': now,
        'metadata--tags--primary': 'important',
        'metadata--tags--secondary': 'urgent',
        count: 42,
      };

      expect(flattened.id).toBe('test-id');
      expect(flattened['metadata--created']).toBe(now);
      expect(flattened['metadata--tags--primary']).toBe('important');
      expect(flattened['metadata--tags--secondary']).toBe('urgent');
      expect(flattened.count).toBe(42);
    });

    it('should handle objects with array properties', () => {
      type TypeWithArrays = {
        items: string[];
        nested: {
          values: number[];
        };
      };

      type FlattenedType = FlattenObject<TypeWithArrays>;

      const flattened: FlattenedType = {
        items: ['a', 'b', 'c'],
        'nested--values': [1, 2, 3],
      };

      expect(flattened.items).toEqual(['a', 'b', 'c']);
      expect(flattened['nested--values']).toEqual([1, 2, 3]);
    });

    it('should handle deeply nested structures', () => {
      type DeeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: string;
              };
            };
          };
        };
      };

      type FlattenedType = FlattenObject<DeeplyNested>;

      const flattened: FlattenedType = {
        'level1--level2--level3--level4--value': 'deep value',
      };

      expect(flattened['level1--level2--level3--level4--value']).toBe(
        'deep value',
      );
    });

    it('should preserve type safety for flattened properties', () => {
      type TypedNested = {
        user: {
          id: number;
          name: string;
        };
        config: {
          enabled: boolean;
        };
      };

      type FlattenedType = FlattenObject<TypedNested>;

      const flattened: FlattenedType = {
        'user--id': 123,
        'user--name': 'Test User',
        'config--enabled': true,
      };

      // Type checking ensures we can't assign wrong types
      expect(typeof flattened['user--id']).toBe('number');
      expect(typeof flattened['user--name']).toBe('string');
      expect(typeof flattened['config--enabled']).toBe('boolean');
    });
  });

  describe('type utility integration', () => {
    it('should work with both utilities together', () => {
      type Union1 = { a: { nested: string } };
      type Union2 = { b: { deep: number } };
      type UnionType = Union1 | Union2;

      type IntersectedType = UnionToIntersection<UnionType>;
      type FlattenedIntersection = FlattenObject<IntersectedType>;

      const result: FlattenedIntersection = {
        'a--nested': 'test',
        'b--deep': 42,
      };

      expect(result['a--nested']).toBe('test');
      expect(result['b--deep']).toBe(42);
    });

    it('should handle real-world-like scenarios', () => {
      // Simulate a typical form configuration
      type FormFieldBase = { required: boolean };
      type TextFieldConfig = FormFieldBase & {
        maxLength: number;
      };
      type NumberFieldConfig = FormFieldBase & {
        min: number;
        max: number;
      };

      type FieldConfigUnion = TextFieldConfig | NumberFieldConfig;
      type FieldConfigIntersection = UnionToIntersection<FieldConfigUnion>;

      // This would require all properties from both field types
      const fieldConfig: FieldConfigIntersection = {
        required: true,
        maxLength: 100,
        min: 0,
        max: 999,
      };

      expect(fieldConfig.required).toBe(true);
      expect(fieldConfig.maxLength).toBe(100);
      expect(fieldConfig.min).toBe(0);
      expect(fieldConfig.max).toBe(999);
    });
  });
});
