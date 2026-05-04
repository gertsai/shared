/**
 * @gertsai/flux - High-performance library for managing data streams and events
 *
 * This package provides reactive data structures and utilities for building
 * event-driven applications with TypeScript.
 *
 * @remarks
 * Key features:
 * - {@link FluxilisCollection} - Event-driven collection with TTL support
 * - {@link DataStream} - Backpressure-aware data streams with transformation pipelines
 * - {@link FluxilisEventEmitter} - Priority-based event handling with async support
 * - {@link ComponentFactory} - Dependency injection for adapters
 *
 * @example
 * ```typescript
 * import { FluxilisCollection, DataStream, FluxilisEventEmitter } from '@gertsai/flux';
 *
 * // Event-driven collection with TTL
 * const cache = new FluxilisCollection<string, User>();
 * cache.setWithTTL('session-123', user, 3600000);
 *
 * // Backpressure-aware data stream
 * const stream = new DataStream<number>({ highWaterMark: 100 });
 * stream.pipe(n => n * 2).on('data', console.log);
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Core Collections
// ---------------------------------------------------------------------------

/**
 * Event-driven collection with Map-like interface.
 *
 * @see {@link FluxilisCollectionOptions} for configuration options
 */
export { FluxilisCollection } from './collection/FluxilisCollection';

/**
 * Options for creating a FluxilisCollection.
 */
export type { FluxilisCollectionOptions } from './collection/FluxilisCollection';

// ---------------------------------------------------------------------------
// Data Streams
// ---------------------------------------------------------------------------

/**
 * Backpressure-aware data stream with transformation pipelines.
 *
 * @see {@link DataStreamOptions} for configuration options
 * @see {@link DataTransformer} for transformation function type
 */
export { DataStream } from './stream/DataStream';

/**
 * Function type for data stream transformations.
 */
export type { DataTransformer } from './stream/DataStream';

// ---------------------------------------------------------------------------
// Event System
// ---------------------------------------------------------------------------

/**
 * Priority-based event emitter with async listener support.
 */
export { FluxilisEventEmitter } from './events/FluxilisEventEmitter';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type {
  /**
   * Valid key types for FluxilisCollection (string or number).
   */
  FluxilisKey,

  /**
   * Interface for DataStream with core stream methods.
   */
  IDataStream,

  /**
   * Configuration options for DataStream.
   */
  DataStreamOptions,

  /**
   * Interface for FluxilisEventEmitter.
   */
  IFluxilisEventEmitter,

  /**
   * Map of collection event names to their handler signatures.
   */
  CollectionEventMap,

  /**
   * Union type of all collection event names.
   */
  CollectionEventName,

  /**
   * Interface for collection storage backends.
   */
  ICollectionBackend,

  /**
   * Interface for data serialization adapters.
   */
  ISerializer,

  /**
   * Generic interface for event emitters.
   */
  IEventEmitter,

  /**
   * Interface for stream adapters.
   */
  IStreamAdapter,
} from './types';

// Re-export useful types from @gertsai/collection
export type { ReadableCollection, WritableCollection } from '@gertsai/collection';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export {
  /**
   * Type guard that checks if a value is a Promise.
   *
   * @param value - Value to check
   * @returns `true` if value is a Promise
   *
   * @example
   * ```typescript
   * const result = maybeAsync();
   * if (isPromise(result)) {
   *   result.then(handle);
   * }
   * ```
   */
  isPromise,

  /**
   * Generates a unique identifier with optional prefix.
   *
   * @param prefix - Optional prefix for the ID
   * @returns Unique string identifier
   *
   * @example
   * ```typescript
   * const id = generateId('user-'); // "user-m1a2b3c4d_xyz789"
   * ```
   */
  generateId,

  /**
   * Wraps an async function for safe error handling.
   *
   * @param fn - Async function to execute
   * @param errorHandler - Optional error handler callback
   * @returns Object with `data` (result or null) and `error` (Error or null)
   *
   * @example
   * ```typescript
   * const { data, error } = await safeAsync(() => fetchData());
   * if (error) console.error(error);
   * ```
   */
  safeAsync,

  /**
   * Creates a deferred Promise with external resolve/reject controls.
   *
   * @returns Object with `promise`, `resolve`, and `reject` functions
   *
   * @example
   * ```typescript
   * const { promise, resolve } = createDeferred<string>();
   * setTimeout(() => resolve('done'), 1000);
   * const result = await promise;
   * ```
   */
  createDeferred,

  /**
   * Creates a debounced version of a function.
   *
   * @param fn - Function to debounce
   * @param delay - Delay in milliseconds
   * @returns Debounced function
   *
   * @example
   * ```typescript
   * const search = debounce(fetchResults, 300);
   * search('query'); // Only executes after 300ms of inactivity
   * ```
   */
  debounce,

  /**
   * Creates a throttled version of a function.
   *
   * @param fn - Function to throttle
   * @param limit - Minimum interval between calls in milliseconds
   * @returns Throttled function
   *
   * @example
   * ```typescript
   * const handleScroll = throttle(updatePosition, 100);
   * window.addEventListener('scroll', handleScroll);
   * ```
   */
  throttle,

  /**
   * Creates a deep clone of an object.
   *
   * @param obj - Object to clone
   * @returns Deep copy of the object
   *
   * @example
   * ```typescript
   * const copy = deepClone({ nested: { value: 1 } });
   * copy.nested.value = 2; // Original unchanged
   * ```
   */
  deepClone,
} from './utils';

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * In-memory backend using JavaScript Map.
 *
 * @remarks
 * This is a synchronous backend suitable for testing or scenarios
 * where data persistence is not required.
 *
 * @example
 * ```typescript
 * const backend = new MapBackend<string, User>();
 * await backend.init(collection);
 * await backend.set('user-1', { name: 'Alice' });
 * ```
 */
export { MapBackend } from './lib/adapters/backend/map.backend';

/**
 * JSON serialization adapter.
 *
 * @example
 * ```typescript
 * const serializer = new JsonSerializer<User>();
 * const json = await serializer.serialize({ name: 'Alice' });
 * const user = await serializer.deserialize(json);
 * ```
 */
export { JsonSerializer } from './lib/adapters/serializer/json.serializer';

// ---------------------------------------------------------------------------
// Dependency Injection
// ---------------------------------------------------------------------------

/**
 * Factory for creating and managing Flux adapters.
 *
 * @remarks
 * Allows registering custom implementations and retrieving them by name.
 * Pre-registered adapters: 'map' (MapBackend), 'json' (JsonSerializer).
 *
 * @example
 * ```typescript
 * import { ComponentFactory } from '@gertsai/flux';
 *
 * const factory = new ComponentFactory();
 * factory.registerBackend('redis', RedisBackend);
 * const backend = factory.getBackend('redis', { host: 'localhost' });
 * ```
 */
export { ComponentFactory, componentFactory } from './core/ComponentFactory';

// ---------------------------------------------------------------------------
// Adapter Interfaces
// ---------------------------------------------------------------------------

/**
 * Interface for storage backend adapters.
 */
export type { IBackend } from './lib/types/backend.interface';

/**
 * Interface for serialization adapters.
 */
export type { ISerializer as ISerializerBackend } from './lib/types/serializer.interface';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * Current version of the @gertsai/flux library.
 *
 * @example
 * ```typescript
 * import { VERSION } from '@gertsai/flux';
 * console.log(`Using @gertsai/flux v${VERSION}`);
 * ```
 */
export const VERSION = '0.1.0';
