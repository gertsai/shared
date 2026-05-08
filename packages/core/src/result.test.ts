/**
 * @fileoverview Tests for Result<T, E> and Option<T> functional types.
 */

import { describe, it, expect } from 'vitest';
import {
  // Result types and functions
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  map,
  mapErr,
  flatMap,
  andThen,
  orElse,
  match,
  toOption,
  tryCatch,
  tryCatchAsync,
  combine,
  combineAll,
  // Option types and functions
  some,
  none,
  isSome,
  isNone,
  unwrapOption,
  unwrapOptionOr,
  mapOption,
  flatMapOption,
  orOption,
  matchOption,
  fromNullable,
  toNullable,
  toUndefined,
  toResult,
  filter,
  combineOptions,
  // Classes
  ResultClass,
  OptionClass,
  // Schemas
  ResultSchema,
  OptionSchema,
  // Type utilities
  type Result,
  type Option,
} from './result';
import { z } from 'zod';

// ============================================================================
// Result<T, E> Tests
// ============================================================================

describe('Result<T, E>', () => {
  describe('ok() and err()', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(result._tag).toBe('Ok');
      expect(result.value).toBe(42);
    });

    it('should create Err result', () => {
      const result = err('error message');
      expect(result._tag).toBe('Err');
      expect(result.error).toBe('error message');
    });

    it('should handle complex types', () => {
      const okResult = ok({ id: 1, name: 'test' });
      expect(okResult.value).toEqual({ id: 1, name: 'test' });

      const errResult = err({ code: 404, message: 'Not found' });
      expect(errResult.error).toEqual({ code: 404, message: 'Not found' });
    });
  });

  describe('isOk() and isErr()', () => {
    it('should correctly identify Ok', () => {
      const result: Result<number, string> = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should correctly identify Err', () => {
      const result: Result<number, string> = err('error');
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });

    it('should narrow types correctly', () => {
      const result: Result<number, string> = ok(42);
      if (isOk(result)) {
        // TypeScript should know result.value is number
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });
  });

  describe('unwrap()', () => {
    it('should unwrap Ok value', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw on Err', () => {
      const result = err('error');
      expect(() => unwrap(result)).toThrow('Attempted to unwrap an Err: error');
    });
  });

  describe('unwrapOr()', () => {
    it('should return value for Ok', () => {
      const result: Result<number, string> = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('should return default for Err', () => {
      const result: Result<number, string> = err('error');
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('unwrapOrElse()', () => {
    it('should return value for Ok', () => {
      const result: Result<number, string> = ok(42);
      expect(unwrapOrElse(result, () => 0)).toBe(42);
    });

    it('should call function for Err', () => {
      const result: Result<number, string> = err('error');
      expect(unwrapOrElse(result, (e) => e.length)).toBe(5);
    });
  });

  describe('unwrapErr()', () => {
    it('should unwrap Err error', () => {
      const result = err('error');
      expect(unwrapErr(result)).toBe('error');
    });

    it('should throw on Ok', () => {
      const result = ok(42);
      expect(() => unwrapErr(result)).toThrow('Attempted to unwrapErr an Ok: 42');
    });
  });

  describe('map()', () => {
    it('should transform Ok value', () => {
      const result: Result<number, string> = ok(42);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped)).toBe(true);
      expect(unwrap(mapped)).toBe(84);
    });

    it('should preserve Err', () => {
      const result: Result<number, string> = err('error');
      const mapped = map(result, (x) => x * 2);
      expect(isErr(mapped)).toBe(true);
      expect(unwrapErr(mapped)).toBe('error');
    });

    it('should handle type changes', () => {
      const result: Result<number, string> = ok(42);
      const mapped = map(result, (x) => x.toString());
      expect(unwrap(mapped)).toBe('42');
    });
  });

  describe('mapErr()', () => {
    it('should transform Err error', () => {
      const result: Result<number, string> = err('error');
      const mapped = mapErr(result, (e) => e.toUpperCase());
      expect(isErr(mapped)).toBe(true);
      expect(unwrapErr(mapped)).toBe('ERROR');
    });

    it('should preserve Ok', () => {
      const result: Result<number, string> = ok(42);
      const mapped = mapErr(result, (e) => e.toUpperCase());
      expect(isOk(mapped)).toBe(true);
      expect(unwrap(mapped)).toBe(42);
    });
  });

  describe('flatMap() / andThen()', () => {
    it('should chain Ok results', () => {
      const result: Result<number, string> = ok(42);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(unwrap(chained)).toBe(84);
    });

    it('should short-circuit on Err', () => {
      const result: Result<number, string> = err('error');
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(isErr(chained)).toBe(true);
      expect(unwrapErr(chained)).toBe('error');
    });

    it('should propagate new Err', () => {
      const result: Result<number, string> = ok(42);
      const chained = flatMap(result, () => err('new error'));
      expect(isErr(chained)).toBe(true);
      expect(unwrapErr(chained)).toBe('new error');
    });

    it('andThen should be alias for flatMap', () => {
      const result: Result<number, string> = ok(42);
      const chained = andThen(result, (x) => ok(x * 2));
      expect(unwrap(chained)).toBe(84);
    });
  });

  describe('orElse()', () => {
    it('should preserve Ok', () => {
      const result: Result<number, string> = ok(42);
      const recovered = orElse(result, () => ok(0));
      expect(unwrap(recovered)).toBe(42);
    });

    it('should recover from Err', () => {
      const result: Result<number, string> = err('error');
      const recovered = orElse(result, (e) => ok(e.length));
      expect(unwrap(recovered)).toBe(5);
    });
  });

  describe('match()', () => {
    it('should call ok handler for Ok', () => {
      const result: Result<number, string> = ok(42);
      const matched = match(result, {
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(matched).toBe('value: 42');
    });

    it('should call err handler for Err', () => {
      const result: Result<number, string> = err('error');
      const matched = match(result, {
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(matched).toBe('error: error');
    });
  });

  describe('toOption()', () => {
    it('should convert Ok to Some', () => {
      const result: Result<number, string> = ok(42);
      const option = toOption(result);
      expect(isSome(option)).toBe(true);
      expect(unwrapOption(option)).toBe(42);
    });

    it('should convert Err to None', () => {
      const result: Result<number, string> = err('error');
      const option = toOption(result);
      expect(isNone(option)).toBe(true);
    });
  });

  describe('tryCatch()', () => {
    it('should wrap successful function', () => {
      const result = tryCatch(() => 42);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should catch thrown error', () => {
      const result = tryCatch(() => {
        throw new Error('test error');
      });
      expect(isErr(result)).toBe(true);
      expect((unwrapErr(result) as Error).message).toBe('test error');
    });
  });

  describe('tryCatchAsync()', () => {
    it('should wrap successful async function', async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should catch rejected promise', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async error');
      });
      expect(isErr(result)).toBe(true);
      expect((unwrapErr(result) as Error).message).toBe('async error');
    });
  });

  describe('combine()', () => {
    it('should combine all Ok results', () => {
      const results: Result<number, string>[] = [ok(1), ok(2), ok(3)];
      const combined = combine(results);
      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([1, 2, 3]);
    });

    it('should return first Err', () => {
      const results: Result<number, string>[] = [ok(1), err('first'), ok(3), err('second')];
      const combined = combine(results);
      expect(isErr(combined)).toBe(true);
      expect(unwrapErr(combined)).toBe('first');
    });

    it('should handle empty array', () => {
      const results: Result<number, string>[] = [];
      const combined = combine(results);
      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([]);
    });
  });

  describe('combineAll()', () => {
    it('should combine all Ok results', () => {
      const results: Result<number, string>[] = [ok(1), ok(2), ok(3)];
      const combined = combineAll(results);
      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([1, 2, 3]);
    });

    it('should collect all errors', () => {
      const results: Result<number, string>[] = [ok(1), err('first'), ok(3), err('second')];
      const combined = combineAll(results);
      expect(isErr(combined)).toBe(true);
      expect(unwrapErr(combined)).toEqual(['first', 'second']);
    });
  });
});

// ============================================================================
// Option<T> Tests
// ============================================================================

describe('Option<T>', () => {
  describe('some() and none()', () => {
    it('should create Some option', () => {
      const option = some(42);
      expect(option._tag).toBe('Some');
      expect(option.value).toBe(42);
    });

    it('should create None option', () => {
      const option = none();
      expect(option._tag).toBe('None');
    });
  });

  describe('isSome() and isNone()', () => {
    it('should correctly identify Some', () => {
      const option: Option<number> = some(42);
      expect(isSome(option)).toBe(true);
      expect(isNone(option)).toBe(false);
    });

    it('should correctly identify None', () => {
      const option: Option<number> = none();
      expect(isSome(option)).toBe(false);
      expect(isNone(option)).toBe(true);
    });
  });

  describe('unwrapOption()', () => {
    it('should unwrap Some value', () => {
      const option = some(42);
      expect(unwrapOption(option)).toBe(42);
    });

    it('should throw on None', () => {
      const option = none();
      expect(() => unwrapOption(option)).toThrow('Attempted to unwrap a None');
    });
  });

  describe('unwrapOptionOr()', () => {
    it('should return value for Some', () => {
      const option: Option<number> = some(42);
      expect(unwrapOptionOr(option, 0)).toBe(42);
    });

    it('should return default for None', () => {
      const option: Option<number> = none();
      expect(unwrapOptionOr(option, 0)).toBe(0);
    });
  });

  describe('mapOption()', () => {
    it('should transform Some value', () => {
      const option: Option<number> = some(42);
      const mapped = mapOption(option, (x) => x * 2);
      expect(unwrapOption(mapped)).toBe(84);
    });

    it('should preserve None', () => {
      const option: Option<number> = none();
      const mapped = mapOption(option, (x) => x * 2);
      expect(isNone(mapped)).toBe(true);
    });
  });

  describe('flatMapOption() / andThenOption()', () => {
    it('should chain Some options', () => {
      const option: Option<number> = some(42);
      const chained = flatMapOption(option, (x) => some(x * 2));
      expect(unwrapOption(chained)).toBe(84);
    });

    it('should short-circuit on None', () => {
      const option: Option<number> = none();
      const chained = flatMapOption(option, (x) => some(x * 2));
      expect(isNone(chained)).toBe(true);
    });

    it('should propagate None', () => {
      const option: Option<number> = some(42);
      const chained = flatMapOption(option, () => none());
      expect(isNone(chained)).toBe(true);
    });
  });

  describe('orOption()', () => {
    it('should return Some if first is Some', () => {
      const option1: Option<number> = some(42);
      const option2: Option<number> = some(0);
      expect(unwrapOption(orOption(option1, option2))).toBe(42);
    });

    it('should return alternative if first is None', () => {
      const option1: Option<number> = none();
      const option2: Option<number> = some(0);
      expect(unwrapOption(orOption(option1, option2))).toBe(0);
    });
  });

  describe('matchOption()', () => {
    it('should call some handler for Some', () => {
      const option: Option<number> = some(42);
      const matched = matchOption(option, {
        some: (x) => `value: ${x}`,
        none: () => 'none',
      });
      expect(matched).toBe('value: 42');
    });

    it('should call none handler for None', () => {
      const option: Option<number> = none();
      const matched = matchOption(option, {
        some: (x) => `value: ${x}`,
        none: () => 'none',
      });
      expect(matched).toBe('none');
    });
  });

  describe('fromNullable()', () => {
    it('should convert value to Some', () => {
      const option = fromNullable(42);
      expect(isSome(option)).toBe(true);
      expect(unwrapOption(option)).toBe(42);
    });

    it('should convert null to None', () => {
      const option = fromNullable(null);
      expect(isNone(option)).toBe(true);
    });

    it('should convert undefined to None', () => {
      const option = fromNullable(undefined);
      expect(isNone(option)).toBe(true);
    });

    it('should handle falsy values correctly', () => {
      expect(isSome(fromNullable(0))).toBe(true);
      expect(isSome(fromNullable(''))).toBe(true);
      expect(isSome(fromNullable(false))).toBe(true);
    });
  });

  describe('toNullable() and toUndefined()', () => {
    it('should convert Some to value', () => {
      const option = some(42);
      expect(toNullable(option)).toBe(42);
      expect(toUndefined(option)).toBe(42);
    });

    it('should convert None to null/undefined', () => {
      const option = none();
      expect(toNullable(option)).toBeNull();
      expect(toUndefined(option)).toBeUndefined();
    });
  });

  describe('toResult()', () => {
    it('should convert Some to Ok', () => {
      const option: Option<number> = some(42);
      const result = toResult(option, 'error');
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should convert None to Err', () => {
      const option: Option<number> = none();
      const result = toResult(option, 'no value');
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result)).toBe('no value');
    });
  });

  describe('filter()', () => {
    it('should keep Some if predicate passes', () => {
      const option: Option<number> = some(42);
      const filtered = filter(option, (x) => x > 0);
      expect(isSome(filtered)).toBe(true);
      expect(unwrapOption(filtered)).toBe(42);
    });

    it('should convert to None if predicate fails', () => {
      const option: Option<number> = some(42);
      const filtered = filter(option, (x) => x < 0);
      expect(isNone(filtered)).toBe(true);
    });

    it('should preserve None', () => {
      const option: Option<number> = none();
      const filtered = filter(option, (x) => x > 0);
      expect(isNone(filtered)).toBe(true);
    });
  });

  describe('combineOptions()', () => {
    it('should combine all Some options', () => {
      const options: Option<number>[] = [some(1), some(2), some(3)];
      const combined = combineOptions(options);
      expect(isSome(combined)).toBe(true);
      expect(unwrapOption(combined)).toEqual([1, 2, 3]);
    });

    it('should return None if any is None', () => {
      const options: Option<number>[] = [some(1), none(), some(3)];
      const combined = combineOptions(options);
      expect(isNone(combined)).toBe(true);
    });
  });
});

// ============================================================================
// ResultClass Tests
// ============================================================================

describe('ResultClass', () => {
  it('should support method chaining', () => {
    const result = ResultClass.ok<number, string>(10)
      .map((x) => x * 2)
      .map((x) => x + 5)
      .unwrap();

    expect(result).toBe(25);
  });

  it('should handle flatMap chaining', () => {
    const divide = (a: number, b: number): ResultClass<number, string> => {
      return b === 0 ? ResultClass.err('Division by zero') : ResultClass.ok(a / b);
    };

    const result = ResultClass.ok<number, string>(20)
      .flatMap((x) => divide(x, 2))
      .flatMap((x) => divide(x, 2))
      .unwrap();

    expect(result).toBe(5);
  });

  it('should short-circuit on error', () => {
    const divide = (a: number, b: number): ResultClass<number, string> => {
      return b === 0 ? ResultClass.err('Division by zero') : ResultClass.ok(a / b);
    };

    const result = ResultClass.ok<number, string>(20)
      .flatMap((x) => divide(x, 0)) // Error here
      .flatMap((x) => divide(x, 2)) // Should not execute
      .unwrapOr(-1);

    expect(result).toBe(-1);
  });

  it('should support tryCatch', () => {
    const result = ResultClass.tryCatch(() => JSON.parse('{"a": 1}'));
    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toEqual({ a: 1 });
  });

  it('should support match', () => {
    const okResult = ResultClass.ok<number, string>(42);
    const errResult = ResultClass.err<string, number>('error');

    expect(
      okResult.match({
        ok: (x) => x * 2,
        err: () => 0,
      })
    ).toBe(84);

    expect(
      errResult.match({
        ok: () => 0,
        err: (e) => e.length,
      })
    ).toBe(5);
  });
});

// ============================================================================
// OptionClass Tests
// ============================================================================

describe('OptionClass', () => {
  it('should support method chaining', () => {
    const result = OptionClass.some(10)
      .map((x) => x * 2)
      .map((x) => x + 5)
      .unwrap();

    expect(result).toBe(25);
  });

  it('should handle filter chaining', () => {
    const result = OptionClass.some(10)
      .filter((x) => x > 5)
      .map((x) => x * 2)
      .unwrapOr(0);

    expect(result).toBe(20);
  });

  it('should short-circuit on None', () => {
    const result = OptionClass.some(10)
      .filter((x) => x > 20) // Becomes None
      .map((x) => x * 100) // Should not execute
      .unwrapOr(-1);

    expect(result).toBe(-1);
  });

  it('should support fromNullable', () => {
    expect(OptionClass.fromNullable(42).isSome()).toBe(true);
    expect(OptionClass.fromNullable(null).isNone()).toBe(true);
    expect(OptionClass.fromNullable(undefined).isNone()).toBe(true);
  });

  it('should support toResult', () => {
    const someResult = OptionClass.some(42).toResult('no value');
    const noneResult = OptionClass.none<number>().toResult('no value');

    expect(someResult.isOk()).toBe(true);
    expect(someResult.unwrap()).toBe(42);
    expect(noneResult.isErr()).toBe(true);
    expect(noneResult.unwrapErr()).toBe('no value');
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe('Zod Schemas', () => {
  describe('ResultSchema', () => {
    const schema = ResultSchema(z.number(), z.string());

    it('should validate Ok result', () => {
      const okResult = { _tag: 'Ok' as const, value: 42 };
      expect(schema.parse(okResult)).toEqual(okResult);
    });

    it('should validate Err result', () => {
      const errResult = { _tag: 'Err' as const, error: 'error' };
      expect(schema.parse(errResult)).toEqual(errResult);
    });

    it('should reject invalid result', () => {
      expect(() => schema.parse({ _tag: 'Ok', value: 'string' })).toThrow();
      expect(() => schema.parse({ _tag: 'Invalid' })).toThrow();
    });
  });

  describe('OptionSchema', () => {
    const schema = OptionSchema(z.number());

    it('should validate Some option', () => {
      const someOption = { _tag: 'Some' as const, value: 42 };
      expect(schema.parse(someOption)).toEqual(someOption);
    });

    it('should validate None option', () => {
      const noneOption = { _tag: 'None' as const };
      expect(schema.parse(noneOption)).toEqual(noneOption);
    });

    it('should reject invalid option', () => {
      expect(() => schema.parse({ _tag: 'Some', value: 'string' })).toThrow();
      expect(() => schema.parse({ _tag: 'Invalid' })).toThrow();
    });
  });
});

// ============================================================================
// Real-world Usage Patterns Tests
// ============================================================================

describe('Real-world Usage Patterns', () => {
  // Simulating a database operation
  interface User {
    id: string;
    name: string;
    email: string;
  }

  const findUser = (id: string): Result<User, string> => {
    if (id === '1') {
      return ok({ id: '1', name: 'John', email: 'john@example.com' });
    }
    return err(`User not found: ${id}`);
  };

  const validateEmail = (email: string): Result<string, string> => {
    if (email.includes('@')) {
      return ok(email);
    }
    return err('Invalid email format');
  };

  it('should chain database operations', () => {
    const result = flatMap(findUser('1'), (user) => {
      return map(validateEmail(user.email), (email) => ({
        ...user,
        email: email.toUpperCase(),
      }));
    });

    expect(isOk(result)).toBe(true);
    expect(unwrap(result).email).toBe('JOHN@EXAMPLE.COM');
  });

  it('should handle not found error', () => {
    const result = flatMap(findUser('999'), (user) => validateEmail(user.email));

    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result)).toBe('User not found: 999');
  });

  it('should work with async operations', async () => {
    const fetchData = async (): Promise<Result<number[], Error>> => {
      return tryCatchAsync(async () => {
        // Simulating async operation
        return [1, 2, 3, 4, 5];
      });
    };

    const result = await fetchData();
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle parsing with Option', () => {
    const parseNumber = (s: string): Option<number> => {
      const n = parseInt(s, 10);
      return isNaN(n) ? none() : some(n);
    };

    const getValue = (key: string): Option<string> => {
      const map: Record<string, string> = { age: '30', count: 'invalid' };
      return fromNullable(map[key]);
    };

    // Successful parsing
    const age = flatMapOption(getValue('age'), parseNumber);
    expect(isSome(age)).toBe(true);
    expect(unwrapOption(age)).toBe(30);

    // Failed parsing
    const count = flatMapOption(getValue('count'), parseNumber);
    expect(isNone(count)).toBe(true);

    // Missing key
    const missing = flatMapOption(getValue('missing'), parseNumber);
    expect(isNone(missing)).toBe(true);
  });
});
