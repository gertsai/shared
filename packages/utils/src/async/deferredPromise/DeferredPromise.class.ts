/**
 * DeferredPromise is a class that provides a promise that can be resolved or rejected later.
 * It is useful for deferred operations that need to be resolved or rejected later.
 * For example, when subscribing to a Firestore collection, the promise is resolved when the subscription is ready.
 * When unsubscribing, the promise is rejected.
 */
export class DeferredPromise<T = undefined> implements PromiseLike<T> {
  private _resolve: (value: T) => void = () => {};
  private _reject: (reason?: unknown) => void = () => {};
  private readonly _promise: Promise<T>;

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get promise() {
    return this._promise;
  }

  resolve(result?: T) {
    this._resolve(result as T);
  }

  reject(err: unknown) {
    this._reject(err);
  }

  then(func: (value: T) => any) {
    return this._promise.then(func);
  }

  catch(func: (err: unknown) => any) {
    return this._promise.catch(func);
  }

  finally(func: () => any) {
    return this._promise.finally(func);
  }
}
