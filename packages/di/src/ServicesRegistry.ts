/**
 * @fileoverview
 * Service registry implementation for managing service factories in the Gerts DI system.
 *
 * The ServicesRegistry is responsible for storing and managing factory functions that create
 * service instances. It provides type-safe registration and creation of services.
 */

import { diLogger } from './logger';
import type { ConsumerType, IService, ServiceFactory, ServiceIdentifier } from './types';

/**
 * Registry for managing service factories.
 * This class stores factory functions and creates service instances on demand.
 * Each registry is associated with a specific consumer type or global services.
 *
 * @template Consumer - The consumer type this registry serves, or null for global services
 *
 * @example
 * ```typescript
 * const userRegistry = new ServicesRegistry<UserEntity>();
 *
 * // Register a service factory
 * userRegistry.register(profileServiceId, ({ consumer }) => {
 *   return new UserProfileService({ consumer });
 * });
 *
 * // Create a service instance
 * const profileService = userRegistry.create(profileServiceId, userEntity);
 * ```
 */
export class ServicesRegistry<Consumer extends ConsumerType | null> {
  /**
   * Internal map storing service identifiers to their corresponding factory functions.
   * This map ensures that each service type has exactly one factory per registry.
   */
  private _factories: Map<ServiceIdentifier, ServiceFactory<any>> = new Map();

  /**
   * Registers a service factory for the given service identifier.
   * Once registered, the factory can be used to create instances of the service.
   *
   * @template I - The service identifier type
   * @param serviceKey - The unique identifier for the service
   * @param serviceFactory - The factory function that creates instances of the service
   *
   * @example
   * ```typescript
   * registry.register(profileServiceId, ({ consumer }) => {
   *   return new UserProfileService({ consumer });
   * });
   * ```
   */
  register<I extends ServiceIdentifier<any>>(
    serviceKey: I,
    serviceFactory: ServiceFactory<I extends ServiceIdentifier<infer T> ? T : never>,
  ): void {
    diLogger.debug('Registering service:', serviceKey, serviceFactory);
    this._factories.set(serviceKey, serviceFactory);
  }

  /**
   * Unregisters a service factory, removing it from the registry.
   * After unregistering, attempts to create the service will fail.
   *
   * @param serviceKey - The service identifier to unregister
   *
   * @example
   * ```typescript
   * registry.unregister(profileServiceId);
   * ```
   */
  unregister(serviceKey: ServiceIdentifier): void {
    this._factories.delete(serviceKey);
  }

  /**
   * Creates a new instance of the specified service using its registered factory.
   * The factory function is called with the provided consumer instance.
   *
   * @param serviceKey - The identifier of the service to create
   * @param consumer - The consumer instance to associate with the service
   * @returns A new instance of the requested service
   * @throws {Error} If no factory is registered for the given service key
   *
   * @example
   * ```typescript
   * const profileService = registry.create(profileServiceId, userEntity);
   * ```
   */
  create(serviceKey: ServiceIdentifier, consumer: Consumer): IService<Consumer> {
    const factory = this._factories.get(serviceKey);
    if (!factory) {
      throw new Error(
        `Service factory not found for ${String(serviceKey)}. ` +
          `Make sure the service is registered before trying to create it.`,
      );
    }
    diLogger.debug('Creating service:', serviceKey, 'for', consumer);
    return factory({ consumer }) as IService<Consumer>;
  }
}
