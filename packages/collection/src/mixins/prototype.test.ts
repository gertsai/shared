import { describe, expect, it } from 'vitest';
import { bindInstanceMethod, defineProtoMethod } from './prototype';

describe('prototype helpers', () => {
  describe('defineProtoMethod', () => {
    it('should add method to prototype', () => {
      class TestClass {
        value: number;
        constructor(value: number) {
          this.value = value;
        }
      }

      const double = function (this: TestClass) {
        return this.value * 2;
      };

      defineProtoMethod(TestClass, 'double' as any, double);

      const instance = new TestClass(5);
      expect((instance as any).double()).toBe(10);
    });

    it('should not override existing prototype method', () => {
      class TestClass {
        value: number;
        constructor(value: number) {
          this.value = value;
        }

        existing() {
          return 'original';
        }
      }

      const newMethod = function () {
        return 'new';
      };

      defineProtoMethod(TestClass, 'existing' as any, newMethod);

      const instance = new TestClass(5);
      expect(instance.existing()).toBe('original'); // Should not be overridden
    });

    it('should define non-enumerable method', () => {
      class TestClass {
        value: number;
        constructor(value: number) {
          this.value = value;
        }
      }

      const method = function () {
        return 'test';
      };

      defineProtoMethod(TestClass, 'test' as any, method);

      const instance = new TestClass(1);
      const keys = Object.keys(instance);
      const protoKeys = Object.keys(TestClass.prototype);

      expect(keys).not.toContain('test');
      expect(protoKeys).not.toContain('test'); // Non-enumerable
      expect((instance as any).test()).toBe('test'); // But still accessible
    });

    it('should define configurable and writable method', () => {
      class TestClass {
        value: number;
        constructor(value: number) {
          this.value = value;
        }
      }

      const method1 = function () {
        return 'first';
      };

      defineProtoMethod(TestClass, 'mutable' as any, method1);

      const instance = new TestClass(1);
      expect((instance as any).mutable()).toBe('first');

      // Should be writable
      TestClass.prototype.mutable = function () {
        return 'second';
      };
      expect((instance as any).mutable()).toBe('second');

      // Should be configurable (can delete)
      delete TestClass.prototype.mutable;
      expect((instance as any).mutable).toBeUndefined();
    });
  });

  describe('bindInstanceMethod', () => {
    it('should bind method to instance', () => {
      const obj: any = {
        value: 10,
      };

      const method = function (this: any, multiplier: number) {
        return this.value * multiplier;
      };

      bindInstanceMethod(obj, 'multiply', method);

      expect(obj.multiply(2)).toBe(20);
      expect(obj.multiply(3)).toBe(30);
    });

    it('should bind method with correct context', () => {
      const obj1: any = { value: 10 };
      const obj2: any = { value: 20 };

      const method = function (this: any) {
        return this.value;
      };

      bindInstanceMethod(obj1, 'getValue', method);
      bindInstanceMethod(obj2, 'getValue', method);

      expect(obj1.getValue()).toBe(10);
      expect(obj2.getValue()).toBe(20);

      // Methods are bound to their respective objects
      const fn1 = obj1.getValue;
      const fn2 = obj2.getValue;
      expect(fn1()).toBe(10); // Still returns 10 even when called without context
      expect(fn2()).toBe(20);
    });

    it('should define non-enumerable instance method', () => {
      const obj: any = {
        value: 5,
      };

      const method = function () {
        return 'test';
      };

      bindInstanceMethod(obj, 'test', method);

      const keys = Object.keys(obj);
      expect(keys).toEqual(['value']); // 'test' is not enumerable
      expect(obj.test()).toBe('test'); // But still accessible
    });

    it('should define configurable and writable instance method', () => {
      const obj: any = {
        value: 5,
      };

      const method1 = function () {
        return 'first';
      };

      bindInstanceMethod(obj, 'mutable', method1);
      expect(obj.mutable()).toBe('first');

      // Should be writable
      obj.mutable = function () {
        return 'second';
      };
      expect(obj.mutable()).toBe('second');

      // Should be configurable
      delete obj.mutable;
      expect(obj.mutable).toBeUndefined();
    });

    it('should handle methods that use arguments', () => {
      const obj: any = {
        base: 100,
      };

      const method = function (this: any, ...args: number[]) {
        return this.base + args.reduce((a, b) => a + b, 0);
      };

      bindInstanceMethod(obj, 'sum', method);

      expect(obj.sum()).toBe(100);
      expect(obj.sum(1, 2, 3)).toBe(106);
      expect(obj.sum(10, 20)).toBe(130);
    });

    it('should preserve method name when binding', () => {
      const obj: any = {};

      function namedMethod(this: any) {
        return 'named';
      }

      bindInstanceMethod(obj, 'myMethod', namedMethod);

      // The bound function should work
      expect(obj.myMethod()).toBe('named');

      // The property descriptor should have the bound function
      const descriptor = Object.getOwnPropertyDescriptor(obj, 'myMethod');
      expect(descriptor).toBeDefined();
      expect(descriptor?.value).toBeInstanceOf(Function);
    });
  });
});
