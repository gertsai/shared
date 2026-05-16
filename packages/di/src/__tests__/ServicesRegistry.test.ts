/**
 * @fileoverview
 * Tests for the ServicesRegistry class.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventEmitter from 'events';

import { ServicesRegistry } from '../ServicesRegistry';
import { createIdentifier } from '../identifier';
import type { ConsumerType, IService, ServiceFactory } from '../types';

// Mock consumer class
class MockConsumer extends EventEmitter implements ConsumerType {
  $destroy() {
    this.emit('destroyed');
  }
}

// Mock service class
class MockService extends EventEmitter implements IService<MockConsumer> {
  private _consumer: MockConsumer;
  private _isReady = Promise.resolve();

  constructor({ consumer }: { consumer: MockConsumer }) {
    super();
    this._consumer = consumer;
  }

  get Consumer() {
    return this._consumer;
  }

  get isReady() {
    return this._isReady;
  }

  $destroy() {
    this.removeAllListeners();
  }
}

// Mock global service class
class MockGlobalService extends EventEmitter implements IService<null> {
  private _isReady = Promise.resolve();

  constructor({}: { consumer: null }) {
    super();
  }

  get Consumer() {
    return null;
  }

  get isReady() {
    return this._isReady;
  }

  $destroy() {
    this.removeAllListeners();
  }
}

describe('ServicesRegistry', () => {
  let registry: ServicesRegistry<MockConsumer>;
  let mockConsumer: MockConsumer;
  let serviceId: ReturnType<typeof createIdentifier>;
  let serviceFactory: ServiceFactory<MockService>;

  beforeEach(() => {
    registry = new ServicesRegistry<MockConsumer>();
    mockConsumer = new MockConsumer();
    serviceId = createIdentifier<MockService, 'test-service'>('test-service');
    serviceFactory = vi.fn(({ consumer }) => new MockService({ consumer }));
  });

  describe('register', () => {
    it('should register a service factory', () => {
      expect(() => {
        registry.register(serviceId, serviceFactory);
      }).not.toThrow();
    });

    it('should allow registering multiple different services', () => {
      const serviceId2 = createIdentifier<MockService, 'test-service-2'>(
        'test-service-2',
      );
      const serviceFactory2 = vi.fn(
        ({ consumer }) => new MockService({ consumer }),
      );

      registry.register(serviceId, serviceFactory);
      registry.register(serviceId2, serviceFactory2);

      expect(() => {
        registry.create(serviceId, mockConsumer);
        registry.create(serviceId2, mockConsumer);
      }).not.toThrow();
    });

    it('should allow overriding a previously registered service', () => {
      const originalFactory = vi.fn(
        ({ consumer }) => new MockService({ consumer }),
      );
      const newFactory = vi.fn(({ consumer }) => new MockService({ consumer }));

      registry.register(serviceId, originalFactory);
      registry.register(serviceId, newFactory);

      registry.create(serviceId, mockConsumer);

      expect(originalFactory).not.toHaveBeenCalled();
      expect(newFactory).toHaveBeenCalledWith({ consumer: mockConsumer });
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry.register(serviceId, serviceFactory);
    });

    it('should unregister a service factory', () => {
      registry.unregister(serviceId);

      expect(() => {
        registry.create(serviceId, mockConsumer);
      }).toThrow('Service factory not found');
    });

    it('should not throw when unregistering a non-existent service', () => {
      const nonExistentId = createIdentifier<MockService, 'non-existent'>(
        'non-existent',
      );

      expect(() => {
        registry.unregister(nonExistentId);
      }).not.toThrow();
    });
  });

  describe('create', () => {
    beforeEach(() => {
      registry.register(serviceId, serviceFactory);
    });

    it('should create a service instance using the registered factory', () => {
      const service = registry.create(serviceId, mockConsumer);

      expect(service).toBeInstanceOf(MockService);
      expect(service.Consumer).toBe(mockConsumer);
      expect(serviceFactory).toHaveBeenCalledWith({ consumer: mockConsumer });
    });

    it('should call the factory with the correct consumer', () => {
      const anotherConsumer = new MockConsumer();

      registry.create(serviceId, mockConsumer);
      registry.create(serviceId, anotherConsumer);

      expect(serviceFactory).toHaveBeenCalledTimes(2);
      expect(serviceFactory).toHaveBeenNthCalledWith(1, {
        consumer: mockConsumer,
      });
      expect(serviceFactory).toHaveBeenNthCalledWith(2, {
        consumer: anotherConsumer,
      });
    });

    it('should throw an error when trying to create a non-registered service', () => {
      const nonExistentId = createIdentifier<MockService, 'non-existent'>(
        'non-existent',
      );

      expect(() => {
        registry.create(nonExistentId, mockConsumer);
      }).toThrow('Service factory not found for Symbol(non-existent)');
    });

    it('should provide helpful error message with registration hint', () => {
      const nonExistentId = createIdentifier<MockService, 'non-existent'>(
        'non-existent',
      );

      expect(() => {
        registry.create(nonExistentId, mockConsumer);
      }).toThrow(
        'Make sure the service is registered before trying to create it',
      );
    });

    it('should create different instances for each call', () => {
      const service1 = registry.create(serviceId, mockConsumer);
      const service2 = registry.create(serviceId, mockConsumer);

      expect(service1).not.toBe(service2);
      expect(service1).toBeInstanceOf(MockService);
      expect(service2).toBeInstanceOf(MockService);
    });
  });

  describe('global services registry', () => {
    let globalRegistry: ServicesRegistry<null>;
    let globalServiceId: ReturnType<typeof createIdentifier>;
    let globalServiceFactory: ServiceFactory<MockGlobalService>;

    beforeEach(() => {
      globalRegistry = new ServicesRegistry<null>();
      globalServiceId = createIdentifier<MockGlobalService, 'global-service'>(
        'global-service',
      );
      globalServiceFactory = vi.fn(
        ({ consumer }) => new MockGlobalService({ consumer }),
      );
    });

    it('should work with global services (null consumer)', () => {
      globalRegistry.register(globalServiceId, globalServiceFactory);

      const service = globalRegistry.create(globalServiceId, null);

      expect(service).toBeInstanceOf(MockGlobalService);
      expect(service.Consumer).toBe(null);
      expect(globalServiceFactory).toHaveBeenCalledWith({ consumer: null });
    });
  });

  describe('error handling', () => {
    it('should log available factories when service not found', () => {
      const consoleSpy = vi
        .spyOn(console, 'trace')
        .mockImplementation(() => {});
      const serviceId2 = createIdentifier<MockService, 'existing-service'>(
        'existing-service',
      );

      registry.register(serviceId2, serviceFactory);

      const nonExistentId = createIdentifier<MockService, 'non-existent'>(
        'non-existent',
      );

      expect(() => {
        registry.create(nonExistentId, mockConsumer);
      }).toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('factory function behavior', () => {
    it('should handle factory functions that throw errors', () => {
      const errorFactory = vi.fn(() => {
        throw new Error('Factory initialization failed');
      });

      registry.register(serviceId, errorFactory);

      expect(() => {
        registry.create(serviceId, mockConsumer);
      }).toThrow('Factory initialization failed');
    });

    it('should handle factory functions that return null/undefined', () => {
      const nullFactory = vi.fn(() => null as any);

      registry.register(serviceId, nullFactory);

      const result = registry.create(serviceId, mockConsumer);
      expect(result).toBe(null);
    });
  });
});
