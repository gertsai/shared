/**
 * @fileoverview
 * Tests for the services manager and related functionality.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventEmitter from 'events';

import { diContainer } from '../manager';
import { createIdentifier } from '../identifier';
import type { ConsumerType, IGlobalService, IService } from '../types';

// Mock consumer classes
class MockConsumer extends EventEmitter implements ConsumerType {
  $destroy() {
    this.emit('destroyed');
  }
}

class AnotherMockConsumer extends EventEmitter implements ConsumerType {
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
  implements IService<AnotherMockConsumer>
{
  private _consumer: AnotherMockConsumer;
  private _isReady = Promise.resolve();

  constructor({ consumer }: { consumer: AnotherMockConsumer }) {
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

class MockGlobalService extends EventEmitter implements IGlobalService {
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

describe('diContainer', () => {
  describe('structure', () => {
    it('should export the expected API', () => {
      expect(diContainer).toBeDefined();
      expect(typeof diContainer.registerService).toBe('function');
      expect(typeof diContainer.registerGlobalService).toBe('function');
      expect(typeof diContainer.resolveServiceDirectory).toBe('function');
      expect(diContainer.$sd).toBeDefined();
    });
  });

  describe('registerService', () => {
    const serviceId = createIdentifier<MockService, 'test-service'>(
      'test-service',
    );

    it('should register a service for a consumer class', () => {
      expect(() => {
        diContainer.registerService(MockConsumer, serviceId, ({ consumer }) => {
          return new MockService({ consumer });
        });
      }).not.toThrow();
    });

    it('should allow registering multiple services for the same consumer', () => {
      const serviceId2 = createIdentifier<MockService, 'test-service-2'>(
        'test-service-2',
      );

      diContainer.registerService(MockConsumer, serviceId, ({ consumer }) => {
        return new MockService({ consumer });
      });

      diContainer.registerService(MockConsumer, serviceId2, ({ consumer }) => {
        return new MockService({ consumer });
      });

      const consumer = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      expect(directory.get(serviceId)).toBeInstanceOf(MockService);
      expect(directory.get(serviceId2)).toBeInstanceOf(MockService);
    });

    it('should allow registering services for different consumer classes', () => {
      const anotherServiceId = createIdentifier<
        AnotherMockService,
        'another-service'
      >('another-service');

      diContainer.registerService(MockConsumer, serviceId, ({ consumer }) => {
        return new MockService({ consumer });
      });

      diContainer.registerService(
        AnotherMockConsumer,
        anotherServiceId,
        ({ consumer }) => {
          return new AnotherMockService({ consumer });
        },
      );

      const mockConsumer = new MockConsumer();
      const anotherConsumer = new AnotherMockConsumer();

      const directory1 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        mockConsumer,
      );
      const directory2 = diContainer.resolveServiceDirectory(
        'AnotherMockConsumer',
        AnotherMockConsumer,
        anotherConsumer,
      );

      expect(directory1.get(serviceId)).toBeInstanceOf(MockService);
      expect(directory2.get(anotherServiceId)).toBeInstanceOf(
        AnotherMockService,
      );
    });
  });

  describe('registerGlobalService', () => {
    const globalServiceId = createIdentifier<
      MockGlobalService,
      'global-test-service'
    >('global-test-service');

    it('should register a global service', () => {
      expect(() => {
        diContainer.registerGlobalService(globalServiceId, ({ consumer }) => {
          return new MockGlobalService({ consumer });
        });
      }).not.toThrow();
    });

    it('should allow accessing global services through $sd', () => {
      diContainer.registerGlobalService(globalServiceId, ({ consumer }) => {
        return new MockGlobalService({ consumer });
      });

      const globalService = diContainer.$sd.get(globalServiceId);
      expect(globalService).toBeInstanceOf(MockGlobalService);
    });

    it('should return the same global service instance on multiple calls', () => {
      diContainer.registerGlobalService(globalServiceId, ({ consumer }) => {
        return new MockGlobalService({ consumer });
      });

      const service1 = diContainer.$sd.get(globalServiceId);
      const service2 = diContainer.$sd.get(globalServiceId);

      expect(service1).toBe(service2);
    });
  });

  describe('resolveServiceDirectory', () => {
    const serviceId = createIdentifier<MockService, 'directory-test-service'>(
      'directory-test-service',
    );

    beforeEach(() => {
      diContainer.registerService(MockConsumer, serviceId, ({ consumer }) => {
        return new MockService({ consumer });
      });
    });

    it('should create a service directory for a consumer', () => {
      const consumer = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      expect(directory).toBeDefined();
      expect(typeof directory.get).toBe('function');
    });

    it('should return the same directory for the same consumer instance', () => {
      const consumer = new MockConsumer();
      const directory1 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );
      const directory2 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      expect(directory1).toBe(directory2);
    });

    it('should create different directories for different consumer instances', () => {
      const consumer1 = new MockConsumer();
      const consumer2 = new MockConsumer();

      const directory1 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer1,
      );
      const directory2 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer2,
      );

      expect(directory1).not.toBe(directory2);
    });

    it('should throw error when no services are registered for consumer class', () => {
      class UnregisteredConsumer extends EventEmitter implements ConsumerType {
        $destroy() {}
      }

      const consumer = new UnregisteredConsumer();

      expect(() => {
        diContainer.resolveServiceDirectory(
          'UnregisteredConsumer',
          UnregisteredConsumer,
          consumer,
        );
      }).toThrow('Service registry not found for UnregisteredConsumer');
    });

    it('should set up automatic cleanup when consumer emits destroyed', () => {
      const consumer = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      // Get a service to ensure it's cached
      const service = directory.get(serviceId);
      const destroySpy = vi.spyOn(service, '$destroy');
      const directoryDestroySpy = vi.spyOn(directory, '$destroy');

      // Emit destroyed event on consumer (PRD-034 FR-006 — past tense
      // aligns with `@gertsai/entity` Model.$destroy semantics).
      consumer.emit('destroyed');

      expect(directoryDestroySpy).toHaveBeenCalledTimes(1);
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT clean up on the legacy "destroy" event (PRD-034 FR-006)', () => {
      const consumer = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      directory.get(serviceId);
      const directoryDestroySpy = vi.spyOn(directory, '$destroy');

      // Emitting the legacy event name must not trigger cleanup — the
      // contract is `'destroyed'` (past tense, per entity Model.ts:46).
      consumer.emit('destroy');

      expect(directoryDestroySpy).not.toHaveBeenCalled();
    });
  });

  describe('global service directory ($sd)', () => {
    const globalServiceId = createIdentifier<
      MockGlobalService,
      'sd-global-service'
    >('sd-global-service');

    beforeEach(() => {
      diContainer.registerGlobalService(globalServiceId, ({ consumer }) => {
        return new MockGlobalService({ consumer });
      });
    });

    it('should provide access to global services', () => {
      const service = diContainer.$sd.get(globalServiceId);
      expect(service).toBeInstanceOf(MockGlobalService);
    });

    it('should maintain singleton behavior for global services', () => {
      const service1 = diContainer.$sd.get(globalServiceId);
      const service2 = diContainer.$sd.get(globalServiceId);

      expect(service1).toBe(service2);
    });
  });

  describe('integration tests', () => {
    const userServiceId = createIdentifier<MockService, 'user-service'>(
      'user-service',
    );
    const globalLoggerServiceId = createIdentifier<
      MockGlobalService,
      'global-logger'
    >('global-logger');

    beforeEach(() => {
      // Register user service
      diContainer.registerService(
        MockConsumer,
        userServiceId,
        ({ consumer }) => {
          return new MockService({ consumer });
        },
      );

      // Register global logger service
      diContainer.registerGlobalService(
        globalLoggerServiceId,
        ({ consumer }) => {
          return new MockGlobalService({ consumer });
        },
      );
    });

    it('should provide complete DI functionality', () => {
      // Create a user
      const user = new MockConsumer();
      const userDirectory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        user,
      );

      // Get user-specific service
      const userService = userDirectory.get(userServiceId);
      expect(userService).toBeInstanceOf(MockService);
      expect(userService.Consumer).toBe(user);

      // Get global service
      const logger = diContainer.$sd.get(globalLoggerServiceId);
      expect(logger).toBeInstanceOf(MockGlobalService);
      expect(logger.Consumer).toBe(null);

      // Services should be independent
      expect(userService).not.toBe(logger);
    });

    it('should handle multiple users with isolated services', () => {
      const user1 = new MockConsumer();
      const user2 = new MockConsumer();

      const directory1 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        user1,
      );
      const directory2 = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        user2,
      );

      const service1 = directory1.get(userServiceId);
      const service2 = directory2.get(userServiceId);

      expect(service1).not.toBe(service2);
      expect(service1.Consumer).toBe(user1);
      expect(service2.Consumer).toBe(user2);

      // But global services should be the same
      const logger1 = diContainer.$sd.get(globalLoggerServiceId);
      const logger2 = diContainer.$sd.get(globalLoggerServiceId);
      expect(logger1).toBe(logger2);
    });

    it('should properly clean up when consumers are destroyed', async () => {
      const user = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        user,
      );

      const userService = directory.get(userServiceId);
      const serviceSpy = vi.spyOn(userService, '$destroy');

      // Destroy the user
      user.$destroy(); // This emits 'destroyed' event

      // Service should be cleaned up
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle factory errors gracefully', () => {
      const errorServiceId = createIdentifier<MockService, 'error-service'>(
        'error-service',
      );

      diContainer.registerService(MockConsumer, errorServiceId, () => {
        throw new Error('Service creation failed');
      });

      const consumer = new MockConsumer();
      const directory = diContainer.resolveServiceDirectory(
        'MockConsumer',
        MockConsumer,
        consumer,
      );

      expect(() => {
        directory.get(errorServiceId);
      }).toThrow('Service creation failed');
    });

    it('should provide helpful error messages', () => {
      class UnknownConsumer extends EventEmitter implements ConsumerType {
        $destroy() {}
      }

      const consumer = new UnknownConsumer();

      expect(() => {
        diContainer.resolveServiceDirectory(
          'UnknownConsumer',
          UnknownConsumer,
          consumer,
        );
      }).toThrow(
        'Make sure to register services for this consumer class before creating instances',
      );
    });
  });
});
