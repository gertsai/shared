/**
 * Prototype/composition mixin helpers
 * This scaffolding will allow us to migrate from instance-level defineProperty
 * towards prototype-based augmentation or thin composition wrappers, without
 * changing existing public behavior in one step.
 */

export type Constructor<T> = new (...args: any[]) => T;

export function defineProtoMethod<T, K extends keyof T>(
  ctor: Constructor<T>,
  name: K,
  fn: T[K],
): void {
  if (!(name in ctor.prototype)) {
    Object.defineProperty(ctor.prototype, name, {
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
  F extends (...args: any[]) => any,
>(target: T, name: K, fn: F): void {
  Object.defineProperty(target, name, {
    value: fn.bind(target),
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
