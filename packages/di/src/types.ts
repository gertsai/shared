/**
 * @fileoverview
 * Core type definitions for the Orchestra Dependency Injection library.
 *
 * This module provides the fundamental types and interfaces used throughout the DI system:
 * - Service interfaces (IService, IGlobalService)
 * - Consumer types and interfaces
 * - Service identification and factory types
 * - Type mapping system for consumer-specific services
 *
 * The type system is designed to provide strong compile-time guarantees while remaining
 * flexible enough to support various service patterns and consumer types.
 */

import type EventEmitter from 'events';

import type { ServiceDirectory } from './ServiceDirectory';

/**
 * A type that represents any object that can consume services and must be destroyable.
 * All service consumers must extend EventEmitter for communication and implement IDestroyable for cleanup.
 *
 * @example
 * ```typescript
 * class MyEntity extends EventEmitter implements IDestroyable {
 *   $destroy() {
 *     // cleanup logic
 *   }
 * }
 * ```
 */
export type ConsumerType = EventEmitter & IDestroyable;

/**
 * Interface for objects that can be destroyed before being garbage collected.
 * This ensures proper cleanup of resources and prevents memory leaks.
 */
export interface IDestroyable {
  /**
   * Cleans up any resources held by the object.
   * Must be called before the object is garbage collected to prevent memory leaks.
   */
  $destroy(): void;
}

/**
 * Interface for objects that consume services via a ServiceDirectory.
 * This interface provides a standardized way for consumers to access their services.
 *
 * @template ServiceClassName - The string literal type representing the consumer class name
 * @template Consumer - The specific consumer type that extends ConsumerType
 *
 * @example
 * ```typescript
 * class UserEntity extends EventEmitter implements ServiceConsumer<'User', UserEntity> {
 *   $sd: ServiceDirectory<'User', UserEntity>;
 *
 *   getUserProfile() {
 *     return this.$sd.get('profile');
 *   }
 * }
 * ```
 */
export interface ServiceConsumer<
  ServiceClassName extends string,
  Consumer extends ConsumerType,
> {
  /** The service directory instance for this consumer, providing access to all registered services. */
  $sd: ServiceDirectory<ServiceClassName, Consumer>;
}

/**
 * Interface for services that are associated with a specific consumer.
 * All services must be destroyable and extend EventEmitter for communication.
 *
 * @template Consumer - The consumer type this service is associated with, or null for global services
 *
 * @example
 * ```typescript
 * class UserProfileService extends AbstractService<UserEntity> {
 *   async loadProfile() {
 *     const user = this.Consumer;
 *     // load profile logic
 *   }
 * }
 * ```
 */
export interface IService<Consumer extends ConsumerType | null>
  extends IDestroyable,
    EventEmitter {
  /** Gets the consumer instance this service is associated with */
  get Consumer(): Consumer;
  /** Returns a promise that resolves when the service is fully initialized and ready for use */
  get isReady(): Promise<void>;
}

/**
 * Interface for global services that are not associated with any specific consumer.
 * Global services are singleton instances that can be accessed from anywhere in the application.
 *
 * @example
 * ```typescript
 * class LoggerService extends AbstractService<null> implements IGlobalService {
 *   log(message: string) {
 *     diLogger.log(message);
 *   }
 * }
 * ```
 */
export interface IGlobalService extends IDestroyable, EventEmitter {
  /** Returns a promise that resolves when the service is fully initialized and ready for use */
  get isReady(): Promise<void>;
}

/**
 * Union type representing any service type (either consumer-specific or global).
 */
export type ServiceType = IService<any> | IGlobalService;

/**
 * A branded string type that uniquely identifies a service.
 * The brand ensures type safety by preventing regular strings from being used as service identifiers.
 *
 * @template T - The service type this identifier represents
 *
 * @example
 * ```typescript
 * const profileServiceId = createIdentifier<UserProfileService>('profile');
 * ```
 */
export type ServiceIdentifier<T extends ServiceType = ServiceType> = string & {
  /** Internal type brand to ensure type safety - do not access directly */
  __TYPE__: T;
};

/**
 * Factory function type for creating service instances.
 * The factory receives the consumer instance and must return a fully configured service.
 *
 * @template Service - The specific service type this factory creates
 *
 * @example
 * ```typescript
 * const profileServiceFactory: ServiceFactory<UserProfileService> = ({ consumer }) => {
 *   return new UserProfileService({ consumer });
 * };
 * ```
 */
export type ServiceFactory<Service extends IService<any>> = (factoryArgs: {
  /** The consumer instance that will own the created service */
  consumer: Service extends IService<infer C> ? C : never;
}) => Service;

/**
 * Advanced type utility that infers the correct service type based on the consumer class name and service interface.
 * This type performs a lookup in the ServiceTypeMapping to find consumer-specific services,
 * falling back to global services if no consumer-specific mapping exists.
 *
 * @template ConsumerClassName - The string literal type of the consumer class name
 * @template Service - The service interface to look for
 *
 * @internal This is an advanced type utility used internally by the DI system
 */
export type InferServiceByKeyAndConsumer<
  ConsumerClassName extends string,
  Service extends IService<any>,
> = ConsumerClassName extends keyof ServiceTypeMapping
  ? InferServiceFromMapping<
      ServiceTypeMapping[ConsumerClassName],
      Service
    > extends infer T
    ? [T] extends [never]
      ? InferServiceFromMapping<ServiceTypeMapping['default'], Service, true>
      : T
    : // Fallback to service type from the identifier
      Service
  : InferServiceFromMapping<ServiceTypeMapping['default'], Service, true>;

/**
 * Helper type that extracts services from a service type mapping that match the given service interface.
 *
 * @template Mapping - The service type mapping object
 * @template Service - The service interface to extract
 * @template Fallback - Whether to fallback to the service type if the service is not found in the mapping
 *
 * @internal This is an advanced type utility used internally by the DI system
 */
export type InferServiceFromMapping<
  Mapping,
  Service extends IService<any>,
  Fallback extends boolean = false,
> =
  Extract<Mapping[keyof Mapping], Service> extends never
    ? Fallback extends true
      ? Service
      : never
    : Extract<Mapping[keyof Mapping], Service>;

// =========== Service Type Mappings ============

/**
 * Interface for defining global service types.
 * Extend this interface in your application to register global services.
 *
 * @example
 * ```typescript
 * declare module '@orchlab/di' {
 *   interface GlobalServiceTypeMapping {
 *     'logger': LoggerService;
 *     'config': ConfigService;
 *     'http': HttpClientService;
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GlobalServiceTypeMapping {}

/**
 * Interface for defining default service types that work with any consumer.
 * Extend this interface in your application to register default services.
 *
 * @example
 * ```typescript
 * declare module '@orchlab/di' {
 *   interface DefaultServiceTypeMapping {
 *     'storage': StorageService;
 *     'validation': ValidationService;
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DefaultServiceTypeMapping {}

/**
 * Main service type mapping interface that defines how services are organized by consumer type.
 * This is the primary extension point for adding consumer-specific service types.
 *
 * @example
 * ```typescript
 * declare module '@orchlab/di' {
 *   interface ServiceTypeMapping {
 *     'User': {
 *       'profile': UserProfileService;
 *       'settings': UserSettingsService;
 *       'notifications': NotificationService;
 *     };
 *     'Chat': {
 *       'messages': MessagesService;
 *       'typing': TypingIndicatorService;
 *     };
 *   }
 * }
 * ```
 */
export interface ServiceTypeMapping {
  /**
   * Global service types - singleton services that don't require a consumer instance.
   * These services are shared across the entire application and have no consumer context.
   */
  __global__: GlobalServiceTypeMapping;
  /**
   * Default service types - services that can work with any consumer type.
   * These provide common functionality that's not consumer-specific.
   */
  default: DefaultServiceTypeMapping;
}

// =========== End Service Type Mappings ============
