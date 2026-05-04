/**
 * Dependency injection container for Flux adapters.
 *
 * @packageDocumentation
 */

import type { FluxilisKey, IEventEmitter, CollectionEventMap } from '../types';
import type { IBackend } from '../lib/types/backend.interface';
import type { ISerializer } from '../lib/types/serializer.interface';

import { MapBackend } from '../lib/adapters/backend/map.backend';
import { JsonSerializer } from '../lib/adapters/serializer/json.serializer';
import { FluxilisEventEmitter } from '../events/FluxilisEventEmitter';

// --- Default name constants ---
const DEFAULT_BACKEND = 'map';
const DEFAULT_SERIALIZER = 'json';
const DEFAULT_EVENT_EMITTER = 'custom';

// --- Types for adapter constructors ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BackendConstructor<K extends FluxilisKey, V> = new (options?: any) => IBackend<K, V>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerializerConstructor<T> = new (options?: any) => ISerializer<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventEmitterConstructor<EventMap extends Record<string, (...args: unknown[]) => void>> = new (
  options?: any,
) => IEventEmitter<EventMap>;

/**
 * Factory for creating and managing Flux components (adapters).
 *
 * ComponentFactory provides a dependency injection container for registering
 * and retrieving various adapters used by Flux components. It supports backends,
 * serializers, and event emitters with built-in defaults.
 *
 * Pre-registered adapters:
 * - Backend: `'map'` - {@link MapBackend} (in-memory storage)
 * - Serializer: `'json'` - {@link JsonSerializer} (JSON serialization)
 * - EventEmitter: `'custom'` - {@link FluxilisEventEmitter}
 *
 * @example Basic usage with singleton
 * ```typescript
 * import { componentFactory } from '@gertsai/flux';
 *
 * const backend = componentFactory.getBackend('map');
 * const serializer = componentFactory.getSerializer('json');
 * ```
 *
 * @example Registering custom adapters
 * ```typescript
 * import { ComponentFactory } from '@gertsai/flux';
 *
 * const factory = new ComponentFactory();
 *
 * // Register custom Redis backend
 * factory.registerBackend('redis', RedisBackend);
 *
 * // Use custom backend
 * const redis = factory.getBackend('redis', {
 *   host: 'localhost',
 *   port: 6379,
 * });
 * ```
 *
 * @example Passing existing instances
 * ```typescript
 * // Factory returns the instance as-is if already instantiated
 * const existingBackend = new CustomBackend();
 * const backend = factory.getBackend(existingBackend);
 * // backend === existingBackend
 * ```
 */
export class ComponentFactory {
  private backendRegistry = new Map<string, BackendConstructor<FluxilisKey, unknown>>();
  private serializerRegistry = new Map<string, SerializerConstructor<unknown>>();
  private eventEmitterRegistry = new Map<
    string,
    EventEmitterConstructor<Record<string, (...args: unknown[]) => void>>
  >();

  constructor() {
    this.registerBackend(DEFAULT_BACKEND, MapBackend);
    this.registerSerializer(DEFAULT_SERIALIZER, JsonSerializer);
    this.registerEventEmitter(DEFAULT_EVENT_EMITTER, FluxilisEventEmitter);
  }

  // --- Registration ---

  /**
   * Registers a backend adapter constructor with the factory.
   *
   * If a backend with the same name already exists, it will be overwritten
   * with a warning logged to the console.
   *
   * @typeParam K - Key type for the backend
   * @typeParam V - Value type for the backend
   * @param name - Unique name to register the backend under
   * @param constructor - Backend class constructor
   *
   * @example
   * ```typescript
   * factory.registerBackend('redis', RedisBackend);
   * factory.registerBackend('leveldb', LevelDBBackend);
   * ```
   */
  registerBackend<K extends FluxilisKey, V>(
    name: string,
    constructor: BackendConstructor<K, V>,
  ): void {
    if (this.backendRegistry.has(name)) {
      console.warn(`ComponentFactory: Backend '${name}' is already registered. Overwriting.`);
    }
    this.backendRegistry.set(name, constructor as BackendConstructor<FluxilisKey, unknown>);
  }

  /**
   * Registers a serializer adapter constructor with the factory.
   *
   * If a serializer with the same name already exists, it will be overwritten
   * with a warning logged to the console.
   *
   * @typeParam T - Type of data the serializer handles
   * @param name - Unique name to register the serializer under
   * @param constructor - Serializer class constructor
   *
   * @example
   * ```typescript
   * factory.registerSerializer('msgpack', MsgPackSerializer);
   * factory.registerSerializer('protobuf', ProtobufSerializer);
   * ```
   */
  registerSerializer<T>(name: string, constructor: SerializerConstructor<T>): void {
    if (this.serializerRegistry.has(name)) {
      console.warn(`ComponentFactory: Serializer '${name}' is already registered. Overwriting.`);
    }
    this.serializerRegistry.set(name, constructor as SerializerConstructor<unknown>);
  }

  /**
   * Registers an event emitter adapter constructor with the factory.
   *
   * If an event emitter with the same name already exists, it will be overwritten
   * with a warning logged to the console.
   *
   * @typeParam EventMap - Type map of event names to handler signatures
   * @param name - Unique name to register the event emitter under
   * @param constructor - Event emitter class constructor
   *
   * @example
   * ```typescript
   * factory.registerEventEmitter('node', NodeEventEmitter);
   * factory.registerEventEmitter('eventemitter3', EventEmitter3);
   * ```
   */
  registerEventEmitter<EventMap extends Record<string, (...args: unknown[]) => void>>(
    name: string,
    constructor: EventEmitterConstructor<EventMap>,
  ): void {
    if (this.eventEmitterRegistry.has(name)) {
      console.warn(`ComponentFactory: EventEmitter '${name}' is already registered. Overwriting.`);
    }
    this.eventEmitterRegistry.set(
      name,
      constructor as EventEmitterConstructor<Record<string, (...args: unknown[]) => void>>,
    );
  }

  // --- Retrieval ---

  /**
   * Gets or creates a backend instance.
   *
   * Can accept a name string, an existing instance, or undefined:
   * - String: Creates a new instance of the registered backend with that name
   * - Instance: Returns the instance as-is (pass-through)
   * - Undefined: Creates a new instance of the default backend ('map')
   *
   * @typeParam K - Key type for the backend
   * @typeParam V - Value type for the backend
   * @param config - Backend name, existing instance, or undefined for default
   * @param options - Options to pass to the backend constructor
   * @returns Backend instance
   * @throws {Error} If the requested backend name is not registered
   * @throws {Error} If instantiation fails
   *
   * @example Get default backend
   * ```typescript
   * const backend = factory.getBackend(undefined);
   * // Returns new MapBackend instance
   * ```
   *
   * @example Get by name
   * ```typescript
   * const redis = factory.getBackend('redis', { host: 'localhost' });
   * ```
   *
   * @example Pass existing instance
   * ```typescript
   * const existing = new CustomBackend();
   * const backend = factory.getBackend(existing);
   * // backend === existing
   * ```
   */
  getBackend<K extends FluxilisKey, V>(
    config: string | IBackend<K, V> | undefined,
    options?: unknown,
  ): IBackend<K, V> {
    if (
      typeof config === 'object' &&
      config !== null &&
      typeof config.set === 'function' &&
      typeof config.get === 'function' &&
      typeof config.init === 'function'
    ) {
      return config;
    }

    const backendName = typeof config === 'string' ? config : DEFAULT_BACKEND;

    const BackendCtor = this.backendRegistry.get(backendName);
    if (!BackendCtor) {
      throw new Error(`ComponentFactory: Backend '${backendName}' is not registered.`);
    }

    try {
      const instance = new BackendCtor(options);
      return instance as IBackend<K, V>;
    } catch (error) {
      throw new Error(
        `ComponentFactory: Failed to instantiate backend '${backendName}': ${(error as Error).message}`,
      );
    }
  }

  /**
   * Gets or creates a serializer instance.
   *
   * Can accept a name string, an existing instance, or undefined:
   * - String: Creates a new instance of the registered serializer with that name
   * - Instance: Returns the instance as-is (pass-through)
   * - Undefined: Creates a new instance of the default serializer ('json')
   *
   * @typeParam T - Type of data the serializer handles
   * @param config - Serializer name, existing instance, or undefined for default
   * @param options - Options to pass to the serializer constructor
   * @returns Serializer instance
   * @throws {Error} If the requested serializer name is not registered
   * @throws {Error} If instantiation fails
   *
   * @example Get default serializer
   * ```typescript
   * const serializer = factory.getSerializer(undefined);
   * // Returns new JsonSerializer instance
   * ```
   *
   * @example Get by name
   * ```typescript
   * const msgpack = factory.getSerializer('msgpack');
   * ```
   */
  getSerializer<T>(config: string | ISerializer<T> | undefined, options?: unknown): ISerializer<T> {
    if (
      typeof config === 'object' &&
      config !== null &&
      typeof config.serialize === 'function' &&
      typeof config.deserialize === 'function'
    ) {
      return config;
    }

    const serializerName = typeof config === 'string' ? config : DEFAULT_SERIALIZER;

    const SerializerCtor = this.serializerRegistry.get(serializerName);
    if (!SerializerCtor) {
      throw new Error(`ComponentFactory: Serializer '${serializerName}' is not registered.`);
    }

    try {
      return new SerializerCtor(options) as ISerializer<T>;
    } catch (error) {
      throw new Error(
        `ComponentFactory: Failed to instantiate serializer '${serializerName}': ${(error as Error).message}`,
      );
    }
  }

  /**
   * Gets or creates an event emitter instance.
   *
   * Can accept a name string, an existing instance, or undefined:
   * - String: Creates a new instance of the registered emitter with that name
   * - Instance: Returns the instance as-is (pass-through)
   * - Undefined: Creates a new instance of the default emitter ('custom')
   *
   * @typeParam EventMap - Type map of event names to handler signatures
   * @param config - Emitter name, existing instance, or undefined for default
   * @param options - Options to pass to the emitter constructor
   * @returns Event emitter instance
   * @throws {Error} If the requested emitter name is not registered
   * @throws {Error} If instantiation fails
   *
   * @example Get default emitter
   * ```typescript
   * const emitter = factory.getEventEmitter(undefined);
   * // Returns new FluxilisEventEmitter instance
   * ```
   *
   * @example Get by name with options
   * ```typescript
   * const emitter = factory.getEventEmitter('custom', {
   *   maxListeners: 50,
   *   asyncListeners: true,
   * });
   * ```
   */
  getEventEmitter<EventMap extends Record<string, (...args: unknown[]) => void>>(
    config: string | IEventEmitter<EventMap> | undefined,
    options?: unknown,
  ): IEventEmitter<EventMap> {
    if (
      typeof config === 'object' &&
      config !== null &&
      typeof config.on === 'function' &&
      typeof config.emit === 'function'
    ) {
      return config;
    }

    const emitterName = typeof config === 'string' ? config : DEFAULT_EVENT_EMITTER;

    const BaseEventEmitterCtor = this.eventEmitterRegistry.get(emitterName);
    if (!BaseEventEmitterCtor) {
      throw new Error(`ComponentFactory: EventEmitter '${emitterName}' is not registered.`);
    }

    try {
      const Constructor = BaseEventEmitterCtor as new (
        options?: unknown,
      ) => IEventEmitter<EventMap>;
      return new Constructor(options);
    } catch (error) {
      throw new Error(
        `ComponentFactory: Failed to instantiate EventEmitter '${emitterName}': ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Singleton instance of ComponentFactory with default adapters registered.
 *
 * Use this when you don't need custom adapter registration and want to
 * use the built-in defaults (MapBackend, JsonSerializer, FluxilisEventEmitter).
 *
 * @example
 * ```typescript
 * import { componentFactory } from '@gertsai/flux';
 *
 * const backend = componentFactory.getBackend('map');
 * const serializer = componentFactory.getSerializer('json');
 * ```
 */
export const componentFactory = new ComponentFactory();
