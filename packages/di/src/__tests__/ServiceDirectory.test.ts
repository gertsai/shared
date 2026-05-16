/**
 * @fileoverview
 * Tests for the ServiceDirectory class.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventEmitter from 'events';

import { ServiceDirectory } from '../ServiceDirectory';
import { ServicesRegistry } from '../ServicesRegistry';
import { createIdentifier } from '../identifier';
import type { ConsumerType, IService, ServiceIdentifier } from '../types';
import { diLogger } from '../logger';

diLogger.level = 0;

// Mock consumer class
class MockConsumer extends EventEmitter implements ConsumerType {
  $destroy() {
    this.emit('destroyed');
  }
}

// Mock service classes
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

class AnotherMockService
  extends EventEmitter
  implements IService<MockConsumer>
{
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

declare module '../types' {
  export interface MockConsumerServiceTypeMapping {
    MockService: MockService;
  }
  export interface AnotherMockConsumerServiceTypeMapping {
    AnotherMockService: AnotherMockService;
  }
  export interface ServiceTypeMapping {
    MockConsumer: MockConsumerServiceTypeMapping;
    AnotherMockService: AnotherMockConsumerServiceTypeMapping;
  }
}

describe('ServiceDirectory', () => {
  let directory: ServiceDirectory<'MockConsumer', MockConsumer>;
  let registry: ServicesRegistry<MockConsumer>;
  let mockConsumer: MockConsumer;
  let serviceId: ServiceIdentifier<MockService>;
  let anotherServiceId: ServiceIdentifier<AnotherMockService>;

  beforeEach(() => {
    registry = new ServicesRegistry<MockConsumer>();
    mockConsumer = new MockConsumer();
    directory = new ServiceDirectory({
      consumer: mockConsumer,
      registry,
    });

    serviceId = createIdentifier<MockService, 'mock-service'>('mock-service');
    anotherServiceId = createIdentifier<AnotherMockService, 'another-service'>(
      'another-service',
    );

    // Register services in the registry
    registry.register(
      serviceId,
      ({ consumer }) => new MockService({ consumer }),
    );
    registry.register(
      anotherServiceId,
      ({ consumer }) => new AnotherMockService({ consumer }),
    );
  });

  describe('constructor', () => {
    it('should create a service directory with consumer and registry', () => {
      expect(directory).toBeDefined();
      expect(directory).toBeInstanceOf(ServiceDirectory);
    });

    it('should work with null consumer for global services', () => {
      const globalRegistry = new ServicesRegistry<null>();
      const globalDirectory = new ServiceDirectory({
        consumer: null,
        registry: globalRegistry,
      });

      expect(globalDirectory).toBeDefined();
      expect(globalDirectory).toBeInstanceOf(ServiceDirectory);
    });
  });

  describe('get', () => {
    it('should create and return a service instance on first call', () => {
      const service = directory.get(serviceId);

      expect(service).toBeInstanceOf(MockService);
      expect(service.Consumer).toBe(mockConsumer);
    });

    it('should return the same service instance on subsequent calls (caching)', () => {
      const service1 = directory.get(serviceId);
      const service2 = directory.get(serviceId);

      expect(service1).toBe(service2);
      expect(service1).toBeInstanceOf(MockService);
    });

    it('should create different instances for different service identifiers', () => {
      const service1 = directory.get(serviceId);
      const service2 = directory.get(anotherServiceId);

      expect(service1).not.toBe(service2);
      expect(service1).toBeInstanceOf(MockService);
      expect(service2).toBeInstanceOf(AnotherMockService);
    });

    it('should throw error when service is not registered in registry', () => {
      const unregisteredId = createIdentifier<MockService, 'unregistered'>(
        'unregistered',
      );

      expect(() => {
        directory.get(unregisteredId);
      }).toThrow('Service factory not found');
    });

    it('should cache multiple different services', () => {
      const service1a = directory.get(serviceId);
      const service2a = directory.get(anotherServiceId);
      const service1b = directory.get(serviceId);
      const service2b = directory.get(anotherServiceId);

      expect(service1a).toBe(service1b);
      expect(service2a).toBe(service2b);
      expect(service1a).not.toBe(service2a);
    });
  });

  describe('$destroy', () => {
    it('should call $destroy on all cached service instances', () => {
      const service1 = directory.get(serviceId);
      const service2 = directory.get(anotherServiceId);

      const destroySpy1 = vi.spyOn(service1, '$destroy');
      const destroySpy2 = vi.spyOn(service2, '$destroy');

      directory.$destroy();

      expect(destroySpy1).toHaveBeenCalledTimes(1);
      expect(destroySpy2).toHaveBeenCalledTimes(1);
    });

    it('should clear the service cache after destroy', () => {
      // Get a service to ensure it's cached
      const service1 = directory.get(serviceId);
      expect(service1).toBeInstanceOf(MockService);

      // Destroy the directory
      directory.$destroy();

      // Getting the service again should create a new instance
      const service2 = directory.get(serviceId);
      expect(service2).toBeInstanceOf(MockService);
      expect(service2).not.toBe(service1);
    });

    it('should handle empty cache gracefully', () => {
      expect(() => {
        directory.$destroy();
      }).not.toThrow();
    });

    it('should handle services that throw during destroy', () => {
      const service = directory.get(serviceId);
      vi.spyOn(service, '$destroy').mockImplementation(() => {
        throw new Error('Destroy failed');
      });

      // Should not throw even if a service destroy fails
      expect(() => {
        directory.$destroy();
      }).not.toThrow();
    });
  });

  describe('lazy loading behavior', () => {
    it('should not create services until they are requested', () => {
      const factorySpy = vi.fn(({ consumer }) => new MockService({ consumer }));
      const lazyServiceId = createIdentifier<MockService, 'lazy-service'>(
        'lazy-service',
      );

      registry.register(lazyServiceId, factorySpy);

      // Factory should not be called yet
      expect(factorySpy).not.toHaveBeenCalled();

      // Now request the service
      directory.get(lazyServiceId);

      // Factory should have been called
      expect(factorySpy).toHaveBeenCalledTimes(1);
      expect(factorySpy).toHaveBeenCalledWith({ consumer: mockConsumer });
    });

    it('should only call factory once per service type', () => {
      const factorySpy = vi.fn(({ consumer }) => new MockService({ consumer }));
      const serviceIdSpy = createIdentifier<MockService, 'spy-service'>(
        'spy-service',
      );

      registry.register(serviceIdSpy, factorySpy);

      // Get the service multiple times
      directory.get(serviceIdSpy);
      directory.get(serviceIdSpy);
      directory.get(serviceIdSpy);

      // Factory should only be called once
      expect(factorySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from service construction', () => {
      const errorFactory = vi.fn(() => {
        throw new Error('Service construction failed');
      });
      const errorServiceId = createIdentifier<MockService, 'error-service'>(
        'error-service',
      );

      registry.register(errorServiceId, errorFactory);

      expect(() => {
        directory.get(errorServiceId);
      }).toThrow('Service construction failed');
    });

    it('should handle null/undefined services from factory', () => {
      const nullFactory = vi.fn(() => null as any);
      const nullServiceId = createIdentifier<MockService, 'null-service'>(
        'null-service',
      );

      registry.register(nullServiceId, nullFactory);

      const result = directory.get(nullServiceId);
      expect(result).toBe(null);
    });
  });

  describe('multiple consumers', () => {
    it('should create separate service instances for different consumers', () => {
      const consumer1 = new MockConsumer();
      const consumer2 = new MockConsumer();

      const directory1 = new ServiceDirectory<'MockConsumer', MockConsumer>({
        consumer: consumer1,
        registry,
      });

      const directory2 = new ServiceDirectory<'MockConsumer', MockConsumer>({
        consumer: consumer2,
        registry,
      });

      const service1 = directory1.get(serviceId);
      const service2 = directory2.get(serviceId);

      expect(service1).not.toBe(service2);
      expect(service1.Consumer).toBe(consumer1);
      expect(service2.Consumer).toBe(consumer2);
    });
  });

  describe('integration with registry', () => {
    it('should reflect registry changes for new services', () => {
      const newServiceId = createIdentifier<MockService, 'new-service'>(
        'new-service',
      );

      // Service not registered yet
      expect(() => {
        directory.get(newServiceId);
      }).toThrow();

      // Register the service
      registry.register(
        newServiceId,
        ({ consumer }) => new MockService({ consumer }),
      );

      // Now it should work
      const service = directory.get(newServiceId);
      expect(service).toBeInstanceOf(MockService);
    });

    it('should not affect already cached services when registry changes', () => {
      const service1 = directory.get(serviceId);

      // Change the factory in the registry
      registry.register(
        serviceId,
        ({ consumer }) => new MockService({ consumer }),
      );

      // Should still return the cached instance
      const service2 = directory.get(serviceId);
      expect(service1).toBe(service2);
    });
  });
});
