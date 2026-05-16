/**
 * Prototype/composition mixin helpers
 * This scaffolding will allow us to migrate from instance-level defineProperty
 * towards prototype-based augmentation or thin composition wrappers, without
 * changing existing public behavior in one step.
 */

export type Constructor<T> = new (...args: never[]) => T;

/**
 * Loose constructor shape accepted by dynamic prototype helpers.
 * Uses `never[]` for contravariant compatibility with any specific constructor.
 */
export type AnyConstructor = abstract new (...args: never[]) => unknown;

export function defineProtoMethod<T, K extends keyof T>(
  ctor: Constructor<T>,
  name: K,
  fn: T[K],
): void;
export function defineProtoMethod(
  ctor: AnyConstructor,
  name: PropertyKey,
  fn: (...args: never[]) => unknown,
): void;
export function defineProtoMethod(
  ctor: AnyConstructor,
  name: PropertyKey,
  fn: unknown,
): void {
  const proto = (ctor as { prototype: object }).prototype;
  if (!(name in proto)) {
    Object.defineProperty(proto, name, {
      value: fn,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
}

export function bindInstanceMethod<
  T extends object,
  K extends PropertyKey,
  F extends (...args: never[]) => unknown,
>(target: T, name: K, fn: F): void {
  Object.defineProperty(target, name, {
    value: fn.bind(target),
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
