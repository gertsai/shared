/**
 * @fileoverview
 * Service identifier creation utilities for the Gerts DI system.
 *
 * This module provides functions for creating type-safe service identifiers
 * that are used throughout the DI system to uniquely identify services.
 */

import type { ServiceIdentifier, ServiceType } from './types';

/**
 * Creates a type-safe service identifier for use in the DI container.
 *
 * This function generates a unique symbol-based identifier that carries both
 * runtime uniqueness and compile-time type information. The identifier ensures
 * that services can be registered and retrieved in a type-safe manner.
 *
 * @template Service - The service type this identifier represents
 * @template I - The string literal type for the identifier name
 *
 * @param identifier - A string name for the service (should be unique within its scope)
 * @returns A branded service identifier that can be used for registration and retrieval
 *
 * @example
 * ```typescript
 * // Define a service class
 * class UserProfileService extends AbstractService<UserEntity> {
 *   // service implementation
 * }
 *
 * // Create a unique identifier for the service
 * const profileServiceId = createIdentifier<UserProfileService>('profile');
 *
 * // Register the service
 * diContainer.registerService(UserEntity, profileServiceId, ({ consumer }) => {
 *   return new UserProfileService({ consumer });
 * });
 *
 * // Retrieve the service (type-safe)
 * const profileService = userDirectory.get(profileServiceId); // Returns UserProfileService
 * ```
 *
 * @example Global service identifier
 * ```typescript
 * class LoggerService extends AbstractService<null> implements IGlobalService {
 *   log(message: string) { console.log(message); }
 * }
 *
 * const loggerServiceId = createIdentifier<LoggerService>('logger');
 *
 * diContainer.registerGlobalService(loggerServiceId, ({ consumer }) => {
 *   return new LoggerService({ consumer });
 * });
 * ```
 *
 * @internal This function uses symbol-based branding to ensure runtime uniqueness
 * while preserving compile-time type safety through TypeScript's type system.
 */
export function createIdentifier<Service extends ServiceType, const I extends string>(
  identifier: I,
) {
  return Symbol(identifier) as unknown as I & ServiceIdentifier<Service>;
}
