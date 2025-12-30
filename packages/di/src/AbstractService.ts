/**
 * @fileoverview
 * Base abstract class for all services in the Orchestra Dependency Injection library.
 *
 * This class provides the fundamental structure and lifecycle management for services,
 * including initialization tracking, consumer association, and proper cleanup.
 */

import EventEmitter from 'events';

import { DeferredPromise } from '@gerts/utils';

import type { ConsumerType, IService } from './types';

/**
 * Abstract base class for all services in the DI system.
 * Provides common functionality for service lifecycle management, consumer association,
 * and integration with Vue's reactivity system.
 *
 * @template Consumer - The consumer type this service is associated with, or null for global services
 *
 * @example
 * ```typescript
 * class UserProfileService extends AbstractService<UserEntity> {
 *   private profileData: any;
 *
 *   constructor({ consumer }: { consumer: UserEntity }) {
 *     super({ consumer });
 *     this.initializeProfile();
 *   }
 *
 *   private async initializeProfile() {
 *     // async initialization logic
 *     this._isReady.resolve();
 *   }
 *
 *   async getProfile() {
 *     await this.isReady;
 *     return this.profileData;
 *   }
 *
 *   $destroy() {
 *     // cleanup logic
 *     this.profileData = null;
 *   }
 * }
 * ```
 */
export abstract class AbstractService<Consumer extends ConsumerType | null>
  extends EventEmitter
  implements IService<Consumer>
{
  /**
   * The consumer instance this service operates on.
   * This provides context and data for the service's operations.
   */
  protected _consumer: Consumer;

  /**
   * Deferred promise that resolves when the service is fully initialized and ready for use.
   * Services should resolve this promise after completing their initialization logic.
   */
  protected _isReady: DeferredPromise<void>;

  /**
   * Constructs a new AbstractService.
   * Automatically sets up the consumer association, readiness tracking, and Vue reactivity integration.
   *
   * @param options - Configuration object for the service
   * @param options.consumer - The consumer instance to associate with this service
   */
  constructor({ consumer }: { consumer: Consumer }) {
    super();
    this._consumer = consumer;
    this._isReady = new DeferredPromise();
  }

  /**
   * Gets the consumer instance this service is associated with.
   * Provides access to the consumer's data and methods for service operations.
   */
  get Consumer() {
    return this._consumer;
  }

  /**
   * Returns a promise that resolves when the service is fully initialized and ready for use.
   * Services should await this promise before performing operations that require initialization.
   *
   * @example
   * ```typescript
   * async function useService() {
   *   await myService.isReady;
   *   const result = await myService.performOperation();
   * }
   * ```
   */
  get isReady() {
    return this._isReady.promise;
  }

  /**
   * Cleans up any resources held by the service.
   * Must be implemented by subclasses to ensure proper resource cleanup and prevent memory leaks.
   *
   * This method should:
   * - Clear any timers or intervals
   * - Remove event listeners
   * - Close connections or streams
   * - Release any held references
   *
   * @example
   * ```typescript
   * $destroy() {
   *   this.clearInterval(this.updateTimer);
   *   this.websocket?.close();
   *   this.removeAllListeners();
   * }
   * ```
   */
  abstract $destroy(): void;
}
