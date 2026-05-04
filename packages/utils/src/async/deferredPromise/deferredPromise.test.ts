import { describe, expect, it, vi } from 'vitest';
import { DeferredPromise } from './DeferredPromise.class';

describe('DeferredPromise', () => {
  describe('constructor', () => {
    it('should create a new DeferredPromise instance', () => {
      const deferred = new DeferredPromise();
      expect(deferred).toBeInstanceOf(DeferredPromise);
      expect(deferred.promise).toBeInstanceOf(Promise);
    });

    it('should create a DeferredPromise with generic type', () => {
      const deferred = new DeferredPromise<string>();
      expect(deferred).toBeInstanceOf(DeferredPromise);
    });
  });

  describe('promise property', () => {
    it('should return the underlying promise', () => {
      const deferred = new DeferredPromise();
      expect(deferred.promise).toBeInstanceOf(Promise);
    });

    it('should return the same promise instance', () => {
      const deferred = new DeferredPromise();
      const promise1 = deferred.promise;
      const promise2 = deferred.promise;
      expect(promise1).toBe(promise2);
    });
  });

  describe('resolve method', () => {
    it('should resolve the promise with undefined when no value provided', async () => {
      const deferred = new DeferredPromise();
      const resultPromise = deferred.promise;

      deferred.resolve();

      const result = await resultPromise;
      expect(result).toBeUndefined();
    });

    it('should resolve the promise with the provided value', async () => {
      const deferred = new DeferredPromise<string>();
      const testValue = 'test value';
      const resultPromise = deferred.promise;

      deferred.resolve(testValue);

      const result = await resultPromise;
      expect(result).toBe(testValue);
    });

    it('should resolve the promise with complex objects', async () => {
      const deferred = new DeferredPromise<{ name: string; age: number }>();
      const testValue = { name: 'John', age: 30 };
      const resultPromise = deferred.promise;

      deferred.resolve(testValue);

      const result = await resultPromise;
      expect(result).toEqual(testValue);
    });

    it('should resolve the promise with null', async () => {
      const deferred = new DeferredPromise<null>();
      const resultPromise = deferred.promise;

      deferred.resolve(null);

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should resolve the promise with zero', async () => {
      const deferred = new DeferredPromise<number>();
      const resultPromise = deferred.promise;

      deferred.resolve(0);

      const result = await resultPromise;
      expect(result).toBe(0);
    });

    it('should resolve the promise with empty string', async () => {
      const deferred = new DeferredPromise<string>();
      const resultPromise = deferred.promise;

      deferred.resolve('');

      const result = await resultPromise;
      expect(result).toBe('');
    });
  });

  describe('reject method', () => {
    it('should reject the promise with the provided error', async () => {
      const deferred = new DeferredPromise();
      const testError = new Error('test error');
      const resultPromise = deferred.promise;

      deferred.reject(testError);

      await expect(resultPromise).rejects.toThrow('test error');
    });

    it('should reject the promise with a string error', async () => {
      const deferred = new DeferredPromise();
      const testError = 'string error';
      const resultPromise = deferred.promise;

      deferred.reject(testError);

      await expect(resultPromise).rejects.toBe(testError);
    });

    it('should reject the promise with undefined', async () => {
      const deferred = new DeferredPromise();
      const resultPromise = deferred.promise;

      deferred.reject(undefined);

      await expect(resultPromise).rejects.toBeUndefined();
    });

    it('should reject the promise with null', async () => {
      const deferred = new DeferredPromise();
      const resultPromise = deferred.promise;

      deferred.reject(null);

      await expect(resultPromise).rejects.toBeNull();
    });
  });

  describe('Promise-like interface', () => {
    it('should implement then method', async () => {
      const deferred = new DeferredPromise<string>();
      const transformedPromise = deferred.then((value) => value.toUpperCase());

      deferred.resolve('hello');

      const result = await transformedPromise;
      expect(result).toBe('HELLO');
    });

    it('should implement catch method', async () => {
      const deferred = new DeferredPromise();
      const errorHandler = vi.fn();
      const caughtPromise = deferred.catch(errorHandler);

      const testError = new Error('test error');
      deferred.reject(testError);

      await caughtPromise;
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should implement finally method', async () => {
      const deferred = new DeferredPromise<string>();
      const finallyHandler = vi.fn();
      const finallyPromise = deferred.finally(finallyHandler);

      deferred.resolve('success');

      await finallyPromise;
      expect(finallyHandler).toHaveBeenCalled();
    });

    it('should chain then, catch, and finally methods', async () => {
      const deferred = new DeferredPromise<string>();
      const thenHandler = vi.fn((value: string) => value.toUpperCase());
      const catchHandler = vi.fn();
      const finallyHandler = vi.fn();

      const chainedPromise = deferred
        .then(thenHandler)
        .catch(catchHandler)
        .finally(finallyHandler);

      deferred.resolve('hello');

      const result = await chainedPromise;
      expect(result).toBe('HELLO');
      expect(thenHandler).toHaveBeenCalledWith('hello');
      expect(catchHandler).not.toHaveBeenCalled();
      expect(finallyHandler).toHaveBeenCalled();
    });
  });

  describe('async/await usage', () => {
    it('should work with async/await syntax', async () => {
      const deferred = new DeferredPromise<number>();

      setTimeout(() => {
        deferred.resolve(42);
      }, 10);

      const result = await deferred.promise;
      expect(result).toBe(42);
    });

    it('should work with async/await and error handling', async () => {
      const deferred = new DeferredPromise();

      setTimeout(() => {
        deferred.reject(new Error('async error'));
      }, 10);

      await expect(deferred.promise).rejects.toThrow('async error');
    });
  });

  describe('multiple resolve/reject calls', () => {
    it('should only resolve once when resolve is called multiple times', async () => {
      const deferred = new DeferredPromise<string>();
      const resultPromise = deferred.promise;

      deferred.resolve('first');
      deferred.resolve('second');
      deferred.resolve('third');

      const result = await resultPromise;
      expect(result).toBe('first');
    });

    it('should only reject once when reject is called multiple times', async () => {
      const deferred = new DeferredPromise();
      const resultPromise = deferred.promise;

      deferred.reject(new Error('first error'));
      deferred.reject(new Error('second error'));

      await expect(resultPromise).rejects.toThrow('first error');
    });

    it('should ignore reject after resolve', async () => {
      const deferred = new DeferredPromise<string>();
      const resultPromise = deferred.promise;

      deferred.resolve('success');
      deferred.reject(new Error('ignored error'));

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should ignore resolve after reject', async () => {
      const deferred = new DeferredPromise<string>();
      const resultPromise = deferred.promise;

      deferred.reject(new Error('error'));
      deferred.resolve('ignored success');

      await expect(resultPromise).rejects.toThrow('error');
    });
  });

  describe('edge cases', () => {
    it('should handle promise that resolves after a delay', async () => {
      const deferred = new DeferredPromise<number>();
      const resultPromise = deferred.promise;

      setTimeout(() => {
        deferred.resolve(100);
      }, 50);

      const result = await resultPromise;
      expect(result).toBe(100);
    });

    it('should handle promise that rejects after a delay', async () => {
      const deferred = new DeferredPromise();
      const resultPromise = deferred.promise;

      setTimeout(() => {
        deferred.reject(new Error('delayed error'));
      }, 50);

      await expect(resultPromise).rejects.toThrow('delayed error');
    });

    it('should work with Promise.all', async () => {
      const deferred1 = new DeferredPromise<number>();
      const deferred2 = new DeferredPromise<string>();

      setTimeout(() => {
        deferred1.resolve(1);
        deferred2.resolve('two');
      }, 10);

      const results = await Promise.all([deferred1.promise, deferred2.promise]);
      expect(results).toEqual([1, 'two']);
    });

    it('should work with Promise.race', async () => {
      const deferred1 = new DeferredPromise<number>();
      const deferred2 = new DeferredPromise<string>();

      setTimeout(() => {
        deferred1.resolve(1);
      }, 10);

      setTimeout(() => {
        deferred2.resolve('two');
      }, 50);

      const result = await Promise.race([deferred1.promise, deferred2.promise]);
      expect(result).toBe(1);
    });
  });

  describe('type safety', () => {
    it('should maintain type safety with generic types', async () => {
      interface TestInterface {
        id: number;
        name: string;
      }

      const deferred = new DeferredPromise<TestInterface>();
      const testValue: TestInterface = { id: 1, name: 'test' };

      deferred.resolve(testValue);

      const result = await deferred.promise;
      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
    });

    it('should work with union types', async () => {
      const deferred = new DeferredPromise<string | number>();

      deferred.resolve('string value');
      const stringResult = await deferred.promise;
      expect(typeof stringResult).toBe('string');

      const deferred2 = new DeferredPromise<string | number>();
      deferred2.resolve(42);
      const numberResult = await deferred2.promise;
      expect(typeof numberResult).toBe('number');
    });
  });
});
