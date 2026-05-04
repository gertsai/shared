/**
 * @fileoverview
 * Tests for the AbstractService class.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventEmitter from 'events';

import { AbstractService } from '../AbstractService';
import type { ConsumerType } from '../types';
// Mock consumer class
class MockConsumer extends EventEmitter implements ConsumerType {
  $destroy() {
    this.emit('destroy');
  }
}

// Concrete implementation of AbstractService for testing
class TestService extends AbstractService<MockConsumer> {
  private _initializationComplete = false;

  constructor({ consumer }: { consumer: MockConsumer }) {
    super({ consumer });
    // Simulate async initialization
    this.initialize();
  }

  private async initialize() {
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 10));
    this._initializationComplete = true;
    this._isReady.resolve();
  }

  get isInitialized() {
    return this._initializationComplete;
  }

  $destroy() {
    this._initializationComplete = false;
    this.removeAllListeners();
  }
}

// Global service implementation for testing
class TestGlobalService extends AbstractService<null> {
  constructor({ consumer }: { consumer: null }) {
    super({ consumer });
    // Resolve immediately for global services
    this._isReady.resolve();
  }

  $destroy() {
    this.removeAllListeners();
  }
}

describe('AbstractService', () => {
  let mockConsumer: MockConsumer;
  let service: TestService;

  beforeEach(() => {
    mockConsumer = new MockConsumer();
    service = new TestService({ consumer: mockConsumer });
  });

  describe('constructor', () => {
    it('should initialize with the provided consumer', () => {
      expect(service.Consumer).toBe(mockConsumer);
    });

    it('should extend EventEmitter', () => {
      expect(service).toBeInstanceOf(EventEmitter);
      expect(typeof service.on).toBe('function');
      expect(typeof service.emit).toBe('function');
    });

    it('should initialize with an unresolved ready promise', async () => {
      const newService = new TestService({ consumer: mockConsumer });
      let isReady = false;

      newService.isReady.then(() => {
        isReady = true;
      });

      // Should not be ready immediately
      expect(isReady).toBe(false);

      // Wait for initialization
      await newService.isReady;
      expect(isReady).toBe(true);
    });

    it('should work with null consumer for global services', () => {
      const globalService = new TestGlobalService({ consumer: null });
      expect(globalService.Consumer).toBe(null);
    });
  });

  describe('Consumer getter', () => {
    it('should return the consumer instance', () => {
      expect(service.Consumer).toBe(mockConsumer);
    });

    it('should return the same consumer on multiple calls', () => {
      const consumer1 = service.Consumer;
      const consumer2 = service.Consumer;
      expect(consumer1).toBe(consumer2);
      expect(consumer1).toBe(mockConsumer);
    });
  });

  describe('isReady property', () => {
    it('should return a Promise', () => {
      expect(service.isReady).toBeInstanceOf(Promise);
    });

    it('should resolve when service initialization is complete', async () => {
      await service.isReady;
      expect(service.isInitialized).toBe(true);
    });

    it('should resolve immediately for already initialized services', async () => {
      // Wait for initial initialization
      await service.isReady;

      // Should resolve immediately on subsequent calls
      const start = Date.now();
      await service.isReady;
      const duration = Date.now() - start;

      // Should be nearly instantaneous (less than 5ms)
      expect(duration).toBeLessThan(5);
    });

    it('should return the same promise instance', () => {
      const promise1 = service.isReady;
      const promise2 = service.isReady;
      expect(promise1).toBe(promise2);
    });
  });

  describe('$destroy method', () => {
    it('should be abstract and implemented by subclasses', () => {
      expect(typeof service.$destroy).toBe('function');
    });

    it('should call the implementation in subclass', () => {
      const destroySpy = vi.spyOn(service, '$destroy');
      service.$destroy();
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it('should clean up service state when called', () => {
      service.$destroy();
      expect(service.isInitialized).toBe(false);
    });
  });

  describe('EventEmitter integration', () => {
    it('should support event emission and listening', () => {
      const listener = vi.fn();
      service.on('test-event', listener);

      service.emit('test-event', 'test-data');

      expect(listener).toHaveBeenCalledWith('test-data');
    });

    it('should remove listeners when destroyed', () => {
      const listener = vi.fn();
      service.on('test-event', listener);

      service.$destroy();
      service.emit('test-event', 'test-data');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle management', () => {
    it('should handle multiple consumers with separate service instances', () => {
      const consumer1 = new MockConsumer();
      const consumer2 = new MockConsumer();

      const service1 = new TestService({ consumer: consumer1 });
      const service2 = new TestService({ consumer: consumer2 });

      expect(service1.Consumer).toBe(consumer1);
      expect(service2.Consumer).toBe(consumer2);
      expect(service1).not.toBe(service2);
    });

    it('should maintain independent state between instances', async () => {
      const service1 = new TestService({ consumer: mockConsumer });
      const service2 = new TestService({ consumer: new MockConsumer() });

      await service1.isReady;
      expect(service1.isInitialized).toBe(true);

      service1.$destroy();
      expect(service1.isInitialized).toBe(false);

      await service2.isReady;
      expect(service2.isInitialized).toBe(true);
    });
  });

  describe('error handling', () => {
    class ErrorService extends AbstractService<MockConsumer> {
      constructor({ consumer }: { consumer: MockConsumer }) {
        super({ consumer });
        // Simulate initialization error
        this.failInitialization();
      }

      private async failInitialization() {
        this._isReady.reject(new Error('Initialization failed'));
      }

      $destroy() {
        this.removeAllListeners();
      }
    }

    it('should handle initialization errors properly', async () => {
      const errorService = new ErrorService({ consumer: mockConsumer });

      await expect(errorService.isReady).rejects.toThrow(
        'Initialization failed',
      );
    });

    it('should handle errors in destroy method', () => {
      class BadDestroyService extends AbstractService<MockConsumer> {
        constructor({ consumer }: { consumer: MockConsumer }) {
          super({ consumer });
          this._isReady.resolve();
        }

        $destroy() {
          throw new Error('Destroy failed');
        }
      }

      const badService = new BadDestroyService({ consumer: mockConsumer });

      expect(() => {
        badService.$destroy();
      }).toThrow('Destroy failed');
    });
  });

  describe('memory management', () => {
    it('should not leak memory through event listeners', () => {
      const service = new TestService({ consumer: mockConsumer });
      const listener = vi.fn();

      service.on('test', listener);
      expect(service.listenerCount('test')).toBe(1);

      service.$destroy();
      expect(service.listenerCount('test')).toBe(0);
    });

    it('should handle multiple event listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      service.on('test', listener1);
      service.on('test', listener2);
      service.on('other', listener3);

      expect(service.listenerCount('test')).toBe(2);
      expect(service.listenerCount('other')).toBe(1);

      service.$destroy();

      expect(service.listenerCount('test')).toBe(0);
      expect(service.listenerCount('other')).toBe(0);
    });
  });
});
