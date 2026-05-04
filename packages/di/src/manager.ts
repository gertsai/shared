/**
 * @fileoverview
 * Global services manager for the Gerts DI library.
 *
 * This module provides the central management functionality for the DI system:
 * - Service registration for different consumer types
 * - Global service registration and management
 * - Service directory resolution and lifecycle management
 * - Automatic cleanup integration with consumer lifecycle
 *
 * The manager maintains separate service registries for different consumer types
 * and provides a unified API for service registration and resolution.
 */

import { EventEmitter } from 'events';

import { ServiceDirectory } from './ServiceDirectory';
import { ServicesRegistry } from './ServicesRegistry';
import type {
  ConsumerType,
  IGlobalService,
  IService,
  ServiceFactory,
  ServiceIdentifier,
} from './types';

/**
 * Type representing a constructor function for consumer classes.
 * Supports both concrete and abstract class constructors.
 */
type ConsumerClassType =
  | (abstract new (...args: any[]) => ConsumerType)
  | (new (...args: any[]) => ConsumerType);

/**
 * Utility type that infers the instance type from a consumer class constructor.
 *
 * @template C - The consumer class constructor type
 */
type InferConsumerType<C extends ConsumerClassType> = C extends new (...args: any[]) => infer T
  ? T
  : C extends abstract new (...args: any[]) => infer T
    ? T
    : never;

/**
 * Global map of services registries, keyed by consumer class constructor or '__global__'.
 * Each consumer class gets its own registry, and global services use the '__global__' key.
 */
const servicesRegistry = new Map<ConsumerClassType | '__global__', ServicesRegistry<any>>();

/**
 * Resolves or creates a services registry for the given consumer class or global services.
 *
 * This function implements lazy registry creation - if a registry doesn't exist for
 * the given key, it creates one and caches it for future use.
 *
 * @template ConsumerClass - The consumer class constructor type
 * @param registryKey - The consumer class constructor or '__global__' for global services
 * @returns The services registry for the given key
 */
function resolveServicesRegistry<ConsumerClass extends ConsumerClassType>(
  registryKey: ConsumerClass | '__global__',
) {
  let registry = servicesRegistry.get(registryKey);
  if (!registry) {
    registry = new ServicesRegistry<any>();
    servicesRegistry.set(registryKey, registry);
  }
  return registry as ServicesRegistry<any>;
}

/**
 * Registers a service factory for a specific consumer class.
 *
 * This function associates a service factory with a consumer class constructor,
 * making the service available to all instances of that consumer class.
 *
 * @template ConsumerClass - The consumer class constructor type
 * @template Id - The service identifier type
 * @template ConsumerType - The inferred consumer instance type
 * @template ServiceType - The service type that will be created
 *
 * @param consumerClass - The constructor of the consumer class that will use this service
 * @param serviceKey - The unique identifier for the service
 * @param serviceFactory - The factory function that creates instances of the service
 *
 * @example
 * ```typescript
 * class UserEntity extends EventEmitter implements IDestroyable {
 *   $destroy() {}
 * }
 *
 * const profileServiceId = createIdentifier<UserProfileService>('profile');
 *
 * registerService(UserEntity, profileServiceId, ({ consumer }) => {
 *   return new UserProfileService({ consumer });
 * });
 * ```
 */
function registerService<
  ConsumerClass extends ConsumerClassType,
  Id extends ServiceIdentifier<any>,
  ConsumerType extends InferConsumerType<ConsumerClass>,
  ServiceType extends IService<ConsumerType> & (Id extends ServiceIdentifier<infer T> ? T : never),
>(consumerClass: ConsumerClass, serviceKey: Id, serviceFactory: ServiceFactory<ServiceType>) {
  const registry = resolveServicesRegistry(consumerClass);
  registry.register(serviceKey, serviceFactory);
}

/**
 * Registers a global service factory that can be accessed from anywhere in the application.
 *
 * Global services are singletons that don't require a consumer instance.
 * They're shared across the entire application and are perfect for utilities,
 * configuration, logging, and other cross-cutting concerns.
 *
 * @template Id - The service identifier type
 * @template ServiceType - The global service type that will be created
 *
 * @param serviceKey - The unique identifier for the global service
 * @param serviceFactory - The factory function that creates the service instance
 *
 * @example
 * ```typescript
 * const loggerServiceId = createIdentifier<LoggerService>('logger');
 *
 * registerGlobalService(loggerServiceId, ({ consumer }) => {
 *   return new LoggerService({ consumer: null });
 * });
 *
 * // Access the global service from anywhere
 * const logger = diContainer.$sd.get(loggerServiceId);
 * ```
 */
function registerGlobalService<
  Id extends ServiceIdentifier<any>,
  ServiceType extends IGlobalService & (Id extends ServiceIdentifier<infer T> ? T : never),
>(serviceKey: Id, serviceFactory: ServiceFactory<ServiceType>) {
  const registry = resolveServicesRegistry('__global__');
  registry.register(serviceKey, serviceFactory);
}

/**
 * WeakMap registry that associates consumer instances with their service directories.
 *
 * Using WeakMap ensures that service directories are garbage collected when
 * their associated consumers are no longer referenced, preventing memory leaks.
 */
const serviceDirectoryRegistry = new WeakMap<ConsumerType, ServiceDirectory<string, any>>();

/**
 * Resolves or creates a service directory for the given consumer instance.
 *
 * This function implements lazy directory creation and automatic lifecycle management:
 * - Creates a new service directory if one doesn't exist for the consumer
 * - Associates the directory with the consumer's service registry
 * - Sets up automatic cleanup when the consumer emits a 'destroy' event
 * - Caches the directory for future use
 *
 * @template ConsumerClassName - String literal type of the consumer class name
 * @template ConsumerClass - The consumer class constructor type
 * @template ConsumerInstance - The specific consumer instance type
 *
 * @param consumerClassName - The name of the consumer class (used for type inference)
 * @param consumerClass - The constructor of the consumer class
 * @param consumer - The consumer instance that needs a service directory
 * @returns The service directory for the consumer
 * @throws {Error} If no service registry is found for the consumer class
 *
 * @example
 * ```typescript
 * const userEntity = new UserEntity();
 * const directory = resolveServiceDirectory('User', UserEntity, userEntity);
 *
 * // Now the user entity can access its services
 * const profileService = directory.get(profileServiceId);
 * ```
 */
function resolveServiceDirectory<
  ConsumerClassName extends string,
  ConsumerClass extends ConsumerClassType,
  ConsumerInstance extends ConsumerType,
>(consumerClassName: ConsumerClassName, consumerClass: ConsumerClass, consumer: ConsumerInstance) {
  let directory = serviceDirectoryRegistry.get(consumer);
  if (!directory) {
    const registry = servicesRegistry.get(consumerClass);

    if (!registry) {
      throw new Error(
        `Service registry not found for ${consumerClass.name}. ` +
          `Make sure to register services for this consumer class before creating instances.`,
      );
    }

    directory = new ServiceDirectory({
      consumer,
      registry,
    });

    // Set up automatic cleanup when the consumer is destroyed
    if (typeof consumer === 'object' && consumer !== null && consumer instanceof EventEmitter) {
      consumer.on('destroy', () => {
        directory?.$destroy();
      });
    }

    serviceDirectoryRegistry.set(consumer, directory);
  }

  return directory as ServiceDirectory<ConsumerClassName, ConsumerInstance>;
}

/**
 * Global service directory for accessing singleton services.
 * This directory is used for services that don't require a consumer instance.
 */
const globalServiceDirectory = new ServiceDirectory({
  consumer: null,
  registry: resolveServicesRegistry('__global__'),
});

/**
 * Main services manager object that provides the public API for the DI system.
 *
 * This object exposes all the necessary functions for:
 * - Registering services for specific consumer types
 * - Registering global services
 * - Resolving service directories for consumers
 * - Accessing global services directly
 *
 * @example
 * ```typescript
 * import { diContainer } from '@gertsai/di';
 *
 * // Register a service for a specific consumer type
 * diContainer.registerService(UserEntity, profileServiceId, ({ consumer }) => {
 *   return new UserProfileService({ consumer });
 * });
 *
 * // Register a global service
 * diContainer.registerGlobalService(loggerServiceId, ({ consumer }) => {
 *   return new LoggerService({ consumer });
 * });
 *
 * // Get a consumer's service directory
 * const userDirectory = diContainer.resolveServiceDirectory('User', UserEntity, userInstance);
 *
 * // Access global services
 * const logger = diContainer.$sd.get(loggerServiceId);
 * ```
 */
export const diContainer = {
  /** Register a service factory for a specific consumer class */
  registerService,
  /** Register a global service factory */
  registerGlobalService,
  /** Resolve or create a service directory for a consumer instance */
  resolveServiceDirectory,
  /** Global service directory for accessing singleton services */
  $sd: globalServiceDirectory,
};
