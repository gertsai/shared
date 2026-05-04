/**
 * Tests for ComponentFactory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFactory, componentFactory } from '../core/ComponentFactory';
import { MapBackend } from '../lib/adapters/backend/map.backend';
import { JsonSerializer } from '../lib/adapters/serializer/json.serializer';
import { FluxilisEventEmitter } from '../events/FluxilisEventEmitter';
import type { IBackend } from '../lib/types/backend.interface';
import type { ISerializer } from '../lib/types/serializer.interface';
import type { IEventEmitter } from '../types';

describe('ComponentFactory', () => {
  let factory: ComponentFactory;

  beforeEach(() => {
    factory = new ComponentFactory();
  });

  // --- Backend Registration and Retrieval ---
  describe('Backend', () => {
    describe('registerBackend()', () => {
      it('should register a backend', () => {
        // Register with a new name
        factory.registerBackend('newmap', MapBackend);
        const backend = factory.getBackend('newmap');

        expect(backend).toBeInstanceOf(MapBackend);
      });

      it('should warn when overwriting existing backend', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        factory.registerBackend('map', MapBackend);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Backend 'map' is already registered"),
        );

        warnSpy.mockRestore();
      });
    });

    describe('getBackend()', () => {
      it('should return default backend when undefined', () => {
        const backend = factory.getBackend(undefined);
        expect(backend).toBeInstanceOf(MapBackend);
      });

      it('should return backend by name', () => {
        const backend = factory.getBackend('map');
        expect(backend).toBeInstanceOf(MapBackend);
      });

      it('should pass-through existing instance', () => {
        const existing = new MapBackend<string, number>();
        const backend = factory.getBackend(existing);
        expect(backend).toBe(existing);
      });

      it('should throw for unregistered backend', () => {
        expect(() => factory.getBackend('nonexistent')).toThrow(
          "Backend 'nonexistent' is not registered",
        );
      });

      it('should pass options to backend constructor', () => {
        // MapBackend accepts options
        const backend = factory.getBackend('map', { someOption: true });
        expect(backend).toBeInstanceOf(MapBackend);
      });

      it('should throw with descriptive error on instantiation failure', () => {
        class FailingBackend {
          constructor() {
            throw new Error('Construction failed');
          }
        }

        factory.registerBackend('failing', FailingBackend as unknown as typeof MapBackend);

        expect(() => factory.getBackend('failing')).toThrow(
          "Failed to instantiate backend 'failing'",
        );
      });
    });
  });

  // --- Serializer Registration and Retrieval ---
  describe('Serializer', () => {
    describe('registerSerializer()', () => {
      it('should register a serializer', () => {
        // Register with a new name
        factory.registerSerializer('newjson', JsonSerializer);
        const serializer = factory.getSerializer('newjson');

        expect(serializer).toBeInstanceOf(JsonSerializer);
      });

      it('should warn when overwriting existing serializer', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        factory.registerSerializer('json', JsonSerializer);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Serializer 'json' is already registered"),
        );

        warnSpy.mockRestore();
      });
    });

    describe('getSerializer()', () => {
      it('should return default serializer when undefined', () => {
        const serializer = factory.getSerializer(undefined);
        expect(serializer).toBeInstanceOf(JsonSerializer);
      });

      it('should return serializer by name', () => {
        const serializer = factory.getSerializer('json');
        expect(serializer).toBeInstanceOf(JsonSerializer);
      });

      it('should pass-through existing instance', () => {
        const existing = new JsonSerializer<{ test: string }>();
        const serializer = factory.getSerializer(existing);
        expect(serializer).toBe(existing);
      });

      it('should throw for unregistered serializer', () => {
        expect(() => factory.getSerializer('nonexistent')).toThrow(
          "Serializer 'nonexistent' is not registered",
        );
      });

      it('should throw with descriptive error on instantiation failure', () => {
        class FailingSerializer {
          constructor() {
            throw new Error('Construction failed');
          }
        }

        factory.registerSerializer(
          'failing',
          FailingSerializer as unknown as typeof JsonSerializer,
        );

        expect(() => factory.getSerializer('failing')).toThrow(
          "Failed to instantiate serializer 'failing'",
        );
      });
    });
  });

  // --- Event Emitter Registration and Retrieval ---
  describe('EventEmitter', () => {
    describe('registerEventEmitter()', () => {
      it('should register an event emitter', () => {
        // Register with a new name
        factory.registerEventEmitter('newemitter', FluxilisEventEmitter);
        const emitter = factory.getEventEmitter('newemitter');

        expect(emitter).toBeInstanceOf(FluxilisEventEmitter);
      });

      it('should warn when overwriting existing emitter', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        factory.registerEventEmitter('custom', FluxilisEventEmitter);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("EventEmitter 'custom' is already registered"),
        );

        warnSpy.mockRestore();
      });
    });

    describe('getEventEmitter()', () => {
      it('should return default emitter when undefined', () => {
        const emitter = factory.getEventEmitter(undefined);
        expect(emitter).toBeInstanceOf(FluxilisEventEmitter);
      });

      it('should return emitter by name', () => {
        const emitter = factory.getEventEmitter('custom');
        expect(emitter).toBeInstanceOf(FluxilisEventEmitter);
      });

      it('should pass-through existing instance', () => {
        const existing = new FluxilisEventEmitter();
        const emitter = factory.getEventEmitter(existing);
        expect(emitter).toBe(existing);
      });

      it('should throw for unregistered emitter', () => {
        const cleanFactory = new ComponentFactory();
        // Remove the default 'custom' registration by creating fresh factory
        // and trying a non-existent name
        expect(() => cleanFactory.getEventEmitter('nonexistent')).toThrow(
          "EventEmitter 'nonexistent' is not registered",
        );
      });

      it('should pass options to emitter constructor', () => {
        const emitter = factory.getEventEmitter('custom', {
          maxListeners: 50,
        });
        expect(emitter).toBeInstanceOf(FluxilisEventEmitter);
      });

      it('should throw with descriptive error on instantiation failure', () => {
        class FailingEmitter {
          constructor() {
            throw new Error('Construction failed');
          }
        }

        factory.registerEventEmitter(
          'failing',
          FailingEmitter as unknown as typeof FluxilisEventEmitter,
        );

        expect(() => factory.getEventEmitter('failing')).toThrow(
          "Failed to instantiate EventEmitter 'failing'",
        );
      });
    });
  });

  // --- Duck Typing Detection ---
  describe('Duck Typing Detection', () => {
    it('should detect backend by duck typing', () => {
      const duckBackend = {
        init: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        has: vi.fn(),
        clear: vi.fn(),
        size: 0,
        keys: vi.fn(),
        values: vi.fn(),
        entries: vi.fn(),
      };

      const result = factory.getBackend(duckBackend as unknown as IBackend<string, unknown>);
      expect(result).toBe(duckBackend);
    });

    it('should detect serializer by duck typing', () => {
      const duckSerializer = {
        serialize: vi.fn(),
        deserialize: vi.fn(),
      };

      const result = factory.getSerializer(duckSerializer as unknown as ISerializer<unknown>);
      expect(result).toBe(duckSerializer);
    });

    it('should detect event emitter by duck typing', () => {
      const duckEmitter = {
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        emit: vi.fn(),
      };

      const result = factory.getEventEmitter(
        duckEmitter as unknown as IEventEmitter<Record<string, () => void>>,
      );
      expect(result).toBe(duckEmitter);
    });
  });

  // --- Singleton Instance ---
  describe('componentFactory singleton', () => {
    it('should be an instance of ComponentFactory', () => {
      expect(componentFactory).toBeInstanceOf(ComponentFactory);
    });

    it('should have default adapters registered', () => {
      // Backend
      expect(() => componentFactory.getBackend('map')).not.toThrow();

      // Serializer
      expect(() => componentFactory.getSerializer('json')).not.toThrow();

      // Event Emitter
      expect(() => componentFactory.getEventEmitter('custom')).not.toThrow();
    });
  });

  // --- Integration Tests ---
  describe('Integration', () => {
    it('should work end-to-end with backend', async () => {
      const backend = factory.getBackend<string, { name: string }>('map');

      // Note: MapBackend requires a collection for full init, but works for basic ops
      await backend.set('user1', { name: 'Alice' });

      const user = await backend.get('user1');
      expect(user).toEqual({ name: 'Alice' });

      const hasUser = await backend.has('user1');
      expect(hasUser).toBe(true);

      await backend.delete('user1');
      const deletedUser = await backend.get('user1');
      expect(deletedUser).toBeUndefined();
    });

    it('should work end-to-end with serializer', async () => {
      const serializer = factory.getSerializer<{ id: number; name: string }>('json');

      const original = { id: 1, name: 'Test' };
      const serialized = await serializer.serialize(original);
      expect(typeof serialized).toBe('string');

      const deserialized = await serializer.deserialize(serialized);
      expect(deserialized).toEqual(original);
    });

    it('should work end-to-end with event emitter', () => {
      const emitter = factory.getEventEmitter('custom');

      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.emit('test', 'hello');

      expect(listener).toHaveBeenCalledWith('hello');
    });
  });
});
