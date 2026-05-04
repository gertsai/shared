/**
 * Extended event emitter implementation with priority-based listeners and async support.
 *
 * @remarks
 * This module provides a flexible event emitter that extends the standard EventEmitter
 * pattern with additional features like listener priorities and async event emission.
 *
 * Key features:
 * - Priority-based listener ordering (higher priority = called first)
 * - Async event emission with `emitAsync` for waiting on all listeners
 * - One-time listeners with `once`
 * - Max listener warnings to prevent memory leaks
 * - Type-safe events with generic TEventMap
 * - `waitForEvent` for awaiting specific events with timeout
 *
 * @packageDocumentation
 */

import type { IEventEmitter, FluxEventHandler } from '../types';
import { isPromise } from '../utils';

/**
 * Default event map type for backward compatibility.
 * Allows any string events with unknown arguments.
 */
export type DefaultEventMap = Record<PropertyKey, (...args: unknown[]) => void>;

/**
 * Generic listener function type for internal use.
 * @internal
 */
type AnyListener = (...args: unknown[]) => void | Promise<void>;

/**
 * Internal structure for storing listener metadata.
 * @internal
 */
interface ListenerInfo {
  /** The listener function to call */
  listener: AnyListener;
  /** Whether this listener should be removed after first invocation */
  once: boolean;
  /** Priority level for ordering (higher = called first) */
  priority: number;
}

/**
 * Extended event emitter with support for priorities, type-safety, and async handlers.
 *
 * Provides a flexible event system that goes beyond the standard EventEmitter
 * pattern with features like listener priorities, type-safe events, and async emission.
 *
 * @typeParam TEventMap - Event map where keys are event names and values are listener signatures
 *
 * @example Basic usage (untyped, backward compatible)
 * ```typescript
 * const emitter = new FluxilisEventEmitter();
 *
 * emitter.on('message', (text) => {
 *   console.log('Received:', text);
 * });
 *
 * emitter.emit('message', 'Hello!'); // Logs: "Received: Hello!"
 * ```
 *
 * @example Type-safe events
 * ```typescript
 * interface MyEvents {
 *   'request': (url: string, method: string) => void;
 *   'response': (status: number, body: unknown) => void;
 *   'error': (error: Error) => void;
 * }
 *
 * const emitter = new FluxilisEventEmitter<MyEvents>();
 *
 * emitter.on('request', (url, method) => {  // url: string, method: string
 *   console.log(`${method} ${url}`);
 * });
 *
 * emitter.emit('request', '/api/users', 'GET');  // ✅ Type-checked
 * ```
 *
 * @example Priority-based listeners
 * ```typescript
 * emitter.on('request', validateAuth, { priority: 100 });   // First
 * emitter.on('request', logRequest, { priority: 50 });      // Second
 * emitter.on('request', handleRequest, { priority: 0 });    // Last
 *
 * emitter.emit('request', '/api', 'GET');
 * ```
 *
 * @example Wait for specific event
 * ```typescript
 * const emitter = new FluxilisEventEmitter<MyEvents>();
 *
 * // Wait for response with 5s timeout
 * const [status, body] = await emitter.waitForEvent('response', 5000);
 * ```
 *
 * @example Async event emission
 * ```typescript
 * emitter.on('save', async (data) => {
 *   await database.save(data);
 * });
 *
 * // Wait for all listeners to complete
 * await emitter.emitAsync('save', userData);
 * ```
 *
 * @implements {IEventEmitter<TEventMap>}
 */
export class FluxilisEventEmitter<
  TEventMap extends Record<PropertyKey, FluxEventHandler> = DefaultEventMap,
> implements IEventEmitter<TEventMap> {
  /** Storage of listeners by event name */
  private _events: Map<keyof TEventMap, ListenerInfo[]> = new Map();

  /** Events currently being emitted (FIX-024: for copy-on-write optimization) */
  private _emitting: Set<keyof TEventMap> = new Set();

  /** Maximum number of listeners per event */
  private _maxListeners: number = 10;

  /** Flag for tracking async handlers */
  private _asyncListeners: boolean = false;

  /** If true, throws when maxListeners exceeded (DoS protection) */
  private _enforceMaxListeners: boolean = false;

  /**
   * Creates a new FluxilisEventEmitter instance.
   *
   * @param options - Configuration options
   * @param options.maxListeners - Maximum listeners per event before warning (default: 10)
   * @param options.asyncListeners - Enable async listener error handling (default: false)
   * @param options.enforceMaxListeners - If true, throws when maxListeners exceeded (default: false)
   *
   * @example Default configuration
   * ```typescript
   * const emitter = new FluxilisEventEmitter();
   * ```
   *
   * @example Custom configuration
   * ```typescript
   * const emitter = new FluxilisEventEmitter({
   *   maxListeners: 100,  // Allow more listeners
   *   asyncListeners: true // Enable async error handling
   * });
   * ```
   *
   * @example DoS protection
   * ```typescript
   * const emitter = new FluxilisEventEmitter({
   *   maxListeners: 50,
   *   enforceMaxListeners: true // Throws if exceeded
   * });
   * ```
   */
  constructor(
    options: {
      maxListeners?: number;
      asyncListeners?: boolean;
      enforceMaxListeners?: boolean;
    } = {},
  ) {
    if (options.maxListeners !== undefined) {
      this._maxListeners = options.maxListeners;
    }

    if (options.asyncListeners !== undefined) {
      this._asyncListeners = options.asyncListeners;
    }

    if (options.enforceMaxListeners !== undefined) {
      this._enforceMaxListeners = options.enforceMaxListeners;
    }
  }

  /**
   * Sets maximum number of listeners per event
   * @param n Maximum number of listeners
   */
  setMaxListeners(n: number): this {
    this._maxListeners = n;
    return this;
  }

  /**
   * Gets maximum number of listeners per event
   */
  getMaxListeners(): number {
    return this._maxListeners;
  }

  /**
   * Adds a listener for an event.
   *
   * Listeners are called in order of priority (highest first). If multiple
   * listeners have the same priority, they are called in the order they
   * were added.
   *
   * @typeParam E - Event name from TEventMap
   * @param event - The event name to listen for
   * @param listener - Function to call when the event is emitted
   * @param options - Additional configuration options
   * @param options.priority - Listener priority (higher = called first, default: 0)
   * @param options.once - If true, listener is removed after first invocation
   * @returns The emitter instance for chaining
   *
   * @example Basic listener
   * ```typescript
   * emitter.on('message', (text) => {
   *   console.log('Received:', text);
   * });
   * ```
   *
   * @example With priority
   * ```typescript
   * emitter.on('request', validateRequest, { priority: 100 });
   * emitter.on('request', logRequest, { priority: 50 });
   * emitter.on('request', handleRequest, { priority: 0 });
   * ```
   *
   * @example Async listener
   * ```typescript
   * emitter.on('save', async (data) => {
   *   await database.save(data);
   * });
   * ```
   */
  on<E extends keyof TEventMap>(
    event: E,
    listener: TEventMap[E],
    options: { priority?: number; once?: boolean } = {},
  ): this {
    const { priority = 0, once = false } = options;

    const listenerInfo: ListenerInfo = {
      listener: listener as ListenerInfo['listener'],
      once,
      priority,
    };

    if (!this._events.has(event)) {
      this._events.set(event, []);
    }

    // FIX-024: Copy-on-write - if currently emitting this event, clone the array
    // to avoid modifying it during iteration
    let listeners = this._events.get(event)!;
    if (this._emitting.has(event)) {
      listeners = [...listeners];
      this._events.set(event, listeners);
    }

    // Insert listener according to priority (highest priority first)
    const index = listeners.findIndex((info) => info.priority < priority);
    if (index === -1) {
      listeners.push(listenerInfo);
    } else {
      listeners.splice(index, 0, listenerInfo);
    }

    // Check maximum listener count
    if (this._maxListeners > 0 && listeners.length > this._maxListeners) {
      if (this._enforceMaxListeners) {
        // Remove the just-added listener
        listeners.pop();
        throw new Error(
          `Maximum listeners (${this._maxListeners}) exceeded for event '${String(event)}'`,
        );
      }

      console.warn(
        `Possible memory leak: added ${listeners.length} ` +
          `listeners for event '${String(event)}', ` +
          `exceeded maximum (${this._maxListeners}).`,
      );
    }

    return this;
  }

  /**
   * Adds a one-time listener for an event
   * @param event Event name
   * @param listener Listener function
   * @param priority Listener priority
   */
  once<E extends keyof TEventMap>(event: E, listener: TEventMap[E], priority: number = 0): this {
    return this.on(event, listener, { once: true, priority });
  }

  /**
   * Removes a listener for an event
   * @param event Event name
   * @param listener Listener function
   */
  off<E extends keyof TEventMap>(event: E, listener?: TEventMap[E]): this {
    if (!this._events.has(event)) {
      return this;
    }

    if (!listener) {
      // If no listener specified, remove all listeners for the event
      this._events.delete(event);
      return this;
    }

    // FIX-024: Copy-on-write - if currently emitting this event, clone the array
    let listeners = this._events.get(event)!;
    if (this._emitting.has(event)) {
      listeners = [...listeners];
      this._events.set(event, listeners);
    }

    // Find and remove specific listener
    const index = listeners.findIndex((info) => info.listener === listener);
    if (index !== -1) {
      listeners.splice(index, 1);

      // If no more listeners, remove the event
      if (listeners.length === 0) {
        this._events.delete(event);
      }
    }

    return this;
  }

  /**
   * Removes all listeners
   * @param event Event name (if specified, only removes listeners for this event)
   */
  removeAllListeners<E extends keyof TEventMap>(event?: E): this {
    if (event !== undefined) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }

    return this;
  }

  /**
   * Returns list of all listeners for an event
   * @param event Event name
   */
  listeners<E extends keyof TEventMap>(event: E): TEventMap[E][] {
    if (!this._events.has(event)) {
      return [];
    }

    return this._events.get(event)!.map((info) => info.listener as TEventMap[E]);
  }

  /**
   * Returns number of listeners for an event
   * @param event Event name
   */
  listenerCount<E extends keyof TEventMap>(event: E): number {
    if (!this._events.has(event)) {
      return 0;
    }

    return this._events.get(event)!.length;
  }

  /**
   * Emits an event, calling all registered listeners synchronously.
   *
   * Listeners are called in priority order (highest first). One-time listeners
   * are automatically removed after being called. If `asyncListeners` is enabled,
   * Promise rejections from async listeners are logged to console.
   *
   * @param event - The event name to emit
   * @param args - Arguments to pass to listeners
   * @returns `true` if the event had listeners, `false` otherwise
   *
   * @example Basic emit
   * ```typescript
   * const hadListeners = emitter.emit('message', 'Hello, world!');
   * ```
   *
   * @example Multiple arguments
   * ```typescript
   * emitter.emit('userAction', userId, action, timestamp);
   * ```
   *
   * @example Check if handled
   * ```typescript
   * if (!emitter.emit('error', err)) {
   *   // No error handlers registered, throw the error
   *   throw err;
   * }
   * ```
   */
  emit<E extends keyof TEventMap>(event: E, ...args: Parameters<TEventMap[E]>): boolean {
    if (!this._events.has(event)) {
      return false;
    }

    // FIX-024: No slice() - use copy-on-write in on()/off() instead
    // This avoids O(N) array copy on every emit
    const listeners = this._events.get(event)!;
    if (listeners.length === 0) {
      return false;
    }

    // Track one-time listeners for removal
    const onceListeners: ListenerInfo['listener'][] = [];

    // FIX-024: Mark this event as "emitting" so on()/off() will copy-on-write
    this._emitting.add(event);

    try {
      // Call listeners
      for (const info of listeners) {
        try {
          const result = info.listener(...args);

          // If async listener mode enabled and result is promise
          if (this._asyncListeners && isPromise(result)) {
            // Handle errors from async listeners
            result.catch((err) => {
              console.error(`Error in async listener for event '${String(event)}':`, err);
            });
          }

          // Mark one-time listeners for removal
          if (info.once) {
            onceListeners.push(info.listener);
          }
        } catch (err) {
          console.error(`Error in listener for event '${String(event)}':`, err);
        }
      }
    } finally {
      // FIX-024: Clear emitting flag
      this._emitting.delete(event);
    }

    // Remove one-time listeners
    for (const listener of onceListeners) {
      this.off(event, listener as TEventMap[E]);
    }

    return true;
  }

  /**
   * Emits an event and waits for all listeners (including async) to complete.
   *
   * This method is useful when you need to ensure all handlers have finished
   * before continuing, such as when saving data or cleaning up resources.
   *
   * Listeners are called in priority order. All async listeners run concurrently
   * and the method waits for all of them to resolve.
   *
   * @param event - The event name to emit
   * @param args - Arguments to pass to listeners
   * @returns Promise resolving to `true` if the event had listeners, `false` otherwise
   *
   * @example Wait for all handlers
   * ```typescript
   * await emitter.emitAsync('save', userData);
   * console.log('All saves complete');
   * ```
   *
   * @example Multiple async operations
   * ```typescript
   * emitter.on('cleanup', async () => await db.close());
   * emitter.on('cleanup', async () => await cache.flush());
   * emitter.on('cleanup', async () => await logs.upload());
   *
   * // Waits for all three operations to complete
   * await emitter.emitAsync('cleanup');
   * process.exit(0);
   * ```
   *
   * @example Error handling
   * ```typescript
   * try {
   *   await emitter.emitAsync('transaction', data);
   * } catch (err) {
   *   // Note: errors are logged, not thrown
   *   // This catch won't be reached
   * }
   * ```
   */
  async emitAsync<E extends keyof TEventMap>(
    event: E,
    ...args: Parameters<TEventMap[E]>
  ): Promise<boolean> {
    if (!this._events.has(event)) {
      return false;
    }

    // FIX-024: No slice() - use copy-on-write in on()/off() instead
    const listeners = this._events.get(event)!;
    if (listeners.length === 0) {
      return false;
    }

    // Track one-time listeners for removal
    const onceListeners: ListenerInfo['listener'][] = [];

    // Array of promises from async listeners
    const promises: Promise<void>[] = [];

    // FIX-024: Mark this event as "emitting" so on()/off() will copy-on-write
    this._emitting.add(event);

    try {
      // Call listeners
      for (const info of listeners) {
        try {
          const result = info.listener(...args);

          // If result is promise, add to array
          if (isPromise(result)) {
            promises.push(result);
          }

          // Mark one-time listeners for removal
          if (info.once) {
            onceListeners.push(info.listener);
          }
        } catch (err) {
          console.error(`Error in listener for event '${String(event)}':`, err);
        }
      }
    } finally {
      // FIX-024: Clear emitting flag
      this._emitting.delete(event);
    }

    // Wait for all async listeners to complete
    if (promises.length > 0) {
      await Promise.all(promises).catch((err) => {
        console.error(`Error in async listeners for event '${String(event)}':`, err);
      });
    }

    // Remove one-time listeners
    for (const listener of onceListeners) {
      this.off(event, listener as TEventMap[E]);
    }

    return true;
  }

  /**
   * Waits for a specific event to be emitted.
   *
   * Returns a promise that resolves with the event arguments when the event is emitted.
   * If a timeout is specified and the event is not emitted within that time,
   * the promise is rejected with a timeout error.
   *
   * @param event - The event name to wait for
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise resolving to the event arguments
   * @throws Error if timeout is reached before event is emitted
   *
   * @example Wait for event
   * ```typescript
   * const [url, method] = await emitter.waitForEvent('request');
   * ```
   *
   * @example With timeout
   * ```typescript
   * try {
   *   const [status, body] = await emitter.waitForEvent('response', 5000);
   *   console.log('Got response:', status);
   * } catch (err) {
   *   console.error('Timeout waiting for response');
   * }
   * ```
   */
  waitForEvent<E extends keyof TEventMap>(
    event: E,
    timeout?: number,
  ): Promise<Parameters<TEventMap[E]>> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const listener = ((...args: Parameters<TEventMap[E]>) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(args);
      }) as TEventMap[E];

      this.once(event, listener);

      if (timeout !== undefined) {
        timeoutId = setTimeout(() => {
          this.off(event, listener);
          reject(new Error(`Timeout waiting for event '${String(event)}'`));
        }, timeout);
      }
    });
  }

  /**
   * Returns list of names of all registered events
   */
  eventNames(): (keyof TEventMap)[] {
    return Array.from(this._events.keys());
  }
}
