/**
 * @fileoverview
 * Service directory implementation for managing service instances per consumer.
 *
 * The ServiceDirectory acts as a service locator and cache for a specific consumer instance.
 * It ensures that each consumer gets its own isolated set of service instances while
 * sharing the same factory definitions through the ServicesRegistry.
 */

import type { AbstractService } from './AbstractService';
import { diLogger } from './logger';
import type { ServicesRegistry } from './ServicesRegistry';
import type {
  ConsumerType,
  IService,
  InferServiceByKeyAndConsumer,
  ServiceIdentifier,
} from './types';

/**
 * Directory for storing and managing service instances for a specific consumer.
 *
 * This class acts as a service locator and cache, ensuring that:
 * - Each consumer gets its own isolated service instances
 * - Services are created lazily (only when first requested)
 * - Service instances are properly cached and reused
 * - All services are cleaned up when the directory is destroyed
 *
 * @template ConsumerClassName - String literal type of the consumer class name for type inference
 * @template Consumer - The specific consumer type that owns this directory
 *
 * @example
 * ```typescript
 * // Create a service directory for a user entity
 * const userDirectory = new ServiceDirectory({
 *   consumer: userEntity,
 *   registry: userServicesRegistry
 * });
 *
 * // Get a service (creates it if it doesn't exist)
 * const profileService = userDirectory.get(profileServiceId);
 *
 * // The service is cached and reused on subsequent calls
 * const sameProfileService = userDirectory.get(profileServiceId); // returns same instance
 * ```
 */
export class ServiceDirectory<
  ConsumerClassName extends string,
  Consumer extends ConsumerType | null,
> {
  /**
   * Cache of created service instances for this consumer.
   * Services are created lazily and stored here for reuse.
   *
   * Key: Service identifier
   * Value: Created service instance
   */
  private _services: Map<
    ServiceIdentifier<IService<Consumer>>,
    AbstractService<Consumer>
  > = new Map();

  /**
   * The consumer instance that owns this service directory.
   * All services created by this directory will be associated with this consumer.
   */
  private _consumer: Consumer;

  /**
   * The services registry containing factory functions for creating services.
   * This registry defines what services are available for this consumer type.
   */
  private _registry: ServicesRegistry<Consumer>;

  /**
   * Constructs a new ServiceDirectory for a given consumer.
   *
   * @param options - Configuration object for the directory
   * @param options.consumer - The consumer instance that will own the services
   * @param options.registry - The services registry containing factory functions
   *
   * @example
   * ```typescript
   * const directory = new ServiceDirectory({
   *   consumer: userEntity,
   *   registry: userServicesRegistry
   * });
   * ```
   */
  constructor(options: {
    consumer: Consumer;
    registry: ServicesRegistry<Consumer>;
  }) {
    this._consumer = options.consumer;
    this._registry = options.registry;
  }

  /**
   * Retrieves a service instance for the given service identifier.
   *
   * This method implements lazy loading - if the service doesn't exist in the cache,
   * it creates a new instance using the registered factory and caches it for future use.
   * Subsequent calls with the same service key will return the cached instance.
   *
   * @template ServiceKey - The service identifier type
   * @template Service - The service type inferred from the identifier
   * @template R - The final resolved service type considering consumer-specific mappings
   *
   * @param serviceKey - The unique identifier of the service to retrieve
   * @returns The service instance (either cached or newly created)
   * @throws {Error} If no factory is registered for the given service key
   *
   * @example
   * ```typescript
   * // First call creates the service
   * const profileService = directory.get(profileServiceId);
   *
   * // Second call returns the cached instance
   * const sameService = directory.get(profileServiceId);
   * console.log(profileService === sameService); // true
   * ```
   */
  get<
    ServiceKey extends ServiceIdentifier<any>,
    Service extends ServiceKey extends ServiceIdentifier<infer T> ? T : never,
    R = InferServiceByKeyAndConsumer<ConsumerClassName, Service>,
  >(serviceKey: ServiceKey): R {
    let service = this._services.get(serviceKey) as R;
    if (!service) {
      diLogger.debug('Creating new service:', serviceKey);
      // Create new service instance using the registry
      service = this._registry.create(serviceKey, this._consumer) as R;
      // Cache the service for future use
      diLogger.debug('Caching service:', serviceKey, service);
      this._services.set(serviceKey, service as AbstractService<Consumer>);
    }
    return service;
  }

  /**
   * Destroys the service directory and all its cached services.
   *
   * This method:
   * 1. Calls $destroy() on all cached service instances
   * 2. Clears the service cache
   * 3. Ensures proper cleanup to prevent memory leaks
   *
   * This method is typically called automatically when the consumer is destroyed,
   * but can also be called manually if needed.
   *
   * @example
   * ```typescript
   * // Manual cleanup
   * directory.$destroy();
   *
   * // Or automatically when consumer emits 'destroy' event
   * consumer.emit('destroy');
   * ```
   */
  $destroy() {
    // Destroy all cached service instances
    this._services.forEach((service) => {
      try {
        service.$destroy();
      } catch (error) {
        // Log the error but don't throw to allow other services to be destroyed
        diLogger.warn(
          'Error destroying service:',
          service.constructor.name,
          error,
        );
      }
    });

    // Clear the cache to prevent memory leaks
    this._services.clear();
  }
}
