/**
 * Utilities for the Flux library
 *
 * Provides common utility functions for async handling, timing control,
 * and object manipulation.
 *
 * @packageDocumentation
 */

/**
 * Type guard that checks if a value is a Promise.
 *
 * Uses duck typing to check for the presence of a `then` method,
 * which works with both native Promises and Promise-like objects (thenables).
 *
 * @typeParam T - The expected resolved type of the Promise
 * @param value - The value to check
 * @returns `true` if value is a Promise or thenable, `false` otherwise
 *
 * @example
 * ```typescript
 * const result = someFunction();
 *
 * if (isPromise(result)) {
 *   // TypeScript knows result is Promise<T>
 *   result.then(value => console.log(value));
 * } else {
 *   // Synchronous result
 *   console.log(result);
 * }
 * ```
 *
 * @example Handling mixed sync/async functions
 * ```typescript
 * function handleResult<T>(result: T | Promise<T>): Promise<T> {
 *   return isPromise(result) ? result : Promise.resolve(result);
 * }
 * ```
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

/**
 * Generates a unique identifier with an optional prefix.
 *
 * Combines a base36-encoded timestamp with a random string to ensure uniqueness.
 * Suitable for client-side ID generation where collision probability is acceptable.
 *
 * @param prefix - Optional prefix to prepend to the generated ID (default: `''`)
 * @returns A unique string identifier in format `{prefix}{timestamp}_{random}`
 *
 * @remarks
 * The generated ID is NOT cryptographically secure and should not be used
 * for security-sensitive purposes. For UUIDs, use a dedicated library.
 *
 * @example Basic usage
 * ```typescript
 * const id = generateId();
 * // "lq1b2c3d4_xyz789"
 * ```
 *
 * @example With prefix
 * ```typescript
 * const userId = generateId('user-');
 * // "user-lq1b2c3d4_xyz789"
 *
 * const sessionId = generateId('session_');
 * // "session_lq1b2c3d4_abc123"
 * ```
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Wraps an async function for safe error handling without try-catch.
 *
 * Returns an object containing either the result data or the caught error,
 * making it easy to handle errors in a functional style.
 *
 * @typeParam T - The type of the successful result
 * @param fn - Async function to execute
 * @param errorHandler - Optional callback to handle errors (e.g., for logging)
 * @returns Promise resolving to `{ data: T, error: null }` on success
 *          or `{ data: null, error: Error }` on failure
 *
 * @example Basic usage
 * ```typescript
 * const { data, error } = await safeAsync(() => fetchUserData(userId));
 *
 * if (error) {
 *   console.error('Failed to fetch user:', error.message);
 *   return;
 * }
 *
 * console.log('User:', data);
 * ```
 *
 * @example With error handler
 * ```typescript
 * const { data, error } = await safeAsync(
 *   () => riskyOperation(),
 *   (err) => logger.error('Operation failed', { error: err })
 * );
 * ```
 *
 * @example Chaining multiple operations
 * ```typescript
 * const { data: user, error: userError } = await safeAsync(() => getUser(id));
 * if (userError) return handleError(userError);
 *
 * const { data: posts, error: postsError } = await safeAsync(() => getPosts(user.id));
 * if (postsError) return handleError(postsError);
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: Error) => void,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (errorHandler) {
      errorHandler(error);
    }
    return { data: null, error };
  }
}

/**
 * Creates a deferred Promise with externally accessible resolve and reject functions.
 *
 * Useful when you need to resolve or reject a Promise from outside its executor,
 * such as when coordinating multiple async operations or implementing timeouts.
 *
 * @typeParam T - The type of the value the Promise will resolve to
 * @returns An object containing:
 *   - `promise`: The Promise instance
 *   - `resolve`: Function to resolve the Promise with a value
 *   - `reject`: Function to reject the Promise with a reason
 *
 * @example Basic usage
 * ```typescript
 * const { promise, resolve, reject } = createDeferred<string>();
 *
 * // Resolve later from elsewhere
 * setTimeout(() => resolve('done'), 1000);
 *
 * const result = await promise; // 'done' after 1 second
 * ```
 *
 * @example Implementing a timeout
 * ```typescript
 * async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
 *   const { promise: timeout, reject } = createDeferred<never>();
 *   const timer = setTimeout(() => reject(new Error('Timeout')), ms);
 *
 *   try {
 *     return await Promise.race([promise, timeout]);
 *   } finally {
 *     clearTimeout(timer);
 *   }
 * }
 * ```
 *
 * @example Coordinating async operations
 * ```typescript
 * const ready = createDeferred<void>();
 *
 * // Worker signals when ready
 * worker.onReady = () => ready.resolve();
 *
 * // Wait for worker to be ready
 * await ready.promise;
 * worker.start();
 * ```
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Creates a debounced version of a function that delays execution
 * until after a period of inactivity.
 *
 * Subsequent calls within the delay period reset the timer.
 * Only the last call's arguments are used when the function finally executes.
 *
 * @typeParam T - The function type being debounced
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds to wait after the last call
 * @returns A debounced version of the function
 *
 * @remarks
 * - The debounced function does not return a value (returns `void`)
 * - Preserves `this` context when called as a method
 * - Creates a new timer for each debounced function instance
 *
 * @example Search input
 * ```typescript
 * const search = debounce((query: string) => {
 *   fetchSearchResults(query);
 * }, 300);
 *
 * // User types quickly
 * search('h');     // Timer starts
 * search('he');    // Timer resets
 * search('hel');   // Timer resets
 * search('hello'); // Timer resets
 * // After 300ms of no calls, fetchSearchResults('hello') is called
 * ```
 *
 * @example Window resize handler
 * ```typescript
 * const handleResize = debounce(() => {
 *   recalculateLayout();
 * }, 100);
 *
 * window.addEventListener('resize', handleResize);
 * ```
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return function (this: unknown, ...args: Parameters<T>): void {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Creates a throttled version of a function that executes at most
 * once per specified time interval.
 *
 * The first call executes immediately. Subsequent calls within the
 * interval are queued and execute once the interval has passed.
 *
 * @typeParam T - The function type being throttled
 * @param fn - The function to throttle
 * @param limit - Minimum interval between executions in milliseconds
 * @returns A throttled version of the function
 *
 * @remarks
 * - The throttled function does not return a value (returns `void`)
 * - Uses trailing edge execution for calls made during the throttle period
 * - Preserves `this` context when called as a method
 *
 * @example Scroll handler
 * ```typescript
 * const handleScroll = throttle(() => {
 *   updateScrollPosition();
 * }, 100);
 *
 * window.addEventListener('scroll', handleScroll);
 * // Updates at most every 100ms while scrolling
 * ```
 *
 * @example Rate-limited API calls
 * ```typescript
 * const saveProgress = throttle((data: SaveData) => {
 *   api.save(data);
 * }, 5000);
 *
 * // Can be called frequently, but only saves every 5 seconds
 * saveProgress(currentState);
 * ```
 *
 * @example Button click protection
 * ```typescript
 * const handleClick = throttle(() => {
 *   submitForm();
 * }, 1000);
 *
 * button.addEventListener('click', handleClick);
 * // Prevents double-clicks from submitting twice
 * ```
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastRun = 0;

  return function (this: unknown, ...args: Parameters<T>): void {
    const now = Date.now();
    const elapsed = now - lastRun;

    const runCallback = () => {
      lastRun = Date.now();
      timeout = null;
      fn.apply(this, args);
    };

    if (!lastRun || elapsed >= limit) {
      runCallback();
    } else if (!timeout) {
      timeout = setTimeout(runCallback, limit - elapsed);
    }
  };
}

/**
 * Creates a deep clone of an object, recursively copying all nested properties.
 *
 * Handles primitive values, Date objects, arrays, Map, Set, and plain objects.
 * Creates new instances of Date objects to preserve their values.
 * Detects and handles circular references to prevent infinite recursion.
 *
 * @typeParam T - The type of object being cloned
 * @param obj - The object to clone
 * @returns A deep copy of the object
 * @throws {Error} If the object contains unsupported types
 *
 * @remarks
 * Supported types:
 * - Primitives (string, number, boolean, null, undefined)
 * - Date objects
 * - Arrays
 * - Map and Set
 * - Plain objects
 *
 * Limitations:
 * - Does not clone functions, symbols, or class instances (other than Date, Map, Set)
 * - Does not preserve prototype chains
 * - Does not handle WeakMap, WeakSet, or typed arrays
 *
 * For complex cloning needs, consider using a library like lodash's `cloneDeep`.
 *
 * @example Basic object cloning
 * ```typescript
 * const original = {
 *   name: 'Alice',
 *   profile: { age: 30, city: 'NYC' }
 * };
 *
 * const copy = deepClone(original);
 * copy.profile.age = 31;
 *
 * console.log(original.profile.age); // 30 (unchanged)
 * console.log(copy.profile.age);     // 31
 * ```
 *
 * @example Array cloning
 * ```typescript
 * const original = [{ id: 1 }, { id: 2 }];
 * const copy = deepClone(original);
 *
 * copy[0].id = 100;
 * console.log(original[0].id); // 1 (unchanged)
 * ```
 *
 * @example Date cloning
 * ```typescript
 * const original = { created: new Date('2024-01-01') };
 * const copy = deepClone(original);
 *
 * copy.created.setFullYear(2025);
 * console.log(original.created.getFullYear()); // 2024 (unchanged)
 * ```
 *
 * @example Circular reference handling
 * ```typescript
 * const obj: Record<string, unknown> = { name: 'test' };
 * obj.self = obj; // Circular reference
 *
 * const copy = deepClone(obj); // Works without infinite recursion
 * console.log(copy.self === copy); // true
 * ```
 */
export function deepClone<T>(obj: T, seen = new WeakMap<object, unknown>()): T {
  // Handle primitives and null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Check for circular reference
  if (seen.has(obj as object)) {
    return seen.get(obj as object) as T;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle Map
  if (obj instanceof Map) {
    const mapCopy = new Map();
    seen.set(obj as object, mapCopy);
    for (const [key, value] of obj) {
      mapCopy.set(deepClone(key, seen), deepClone(value, seen));
    }
    return mapCopy as T;
  }

  // Handle Set
  if (obj instanceof Set) {
    const setCopy = new Set();
    seen.set(obj as object, setCopy);
    for (const value of obj) {
      setCopy.add(deepClone(value, seen));
    }
    return setCopy as T;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    const arrCopy: unknown[] = [];
    seen.set(obj as object, arrCopy);
    for (const item of obj) {
      arrCopy.push(deepClone(item, seen));
    }
    return arrCopy as T;
  }

  // Handle plain objects
  if (obj instanceof Object) {
    const copy: Record<string, unknown> = {};
    seen.set(obj as object, copy);
    for (const key of Object.keys(obj)) {
      copy[key] = deepClone((obj as Record<string, unknown>)[key], seen);
    }
    return copy as T;
  }

  throw new Error(`Cannot clone object: ${obj}`);
}
