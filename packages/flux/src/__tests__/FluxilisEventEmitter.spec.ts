/**
 * Tests for FluxilisEventEmitter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FluxilisEventEmitter } from '../events/FluxilisEventEmitter';

describe('FluxilisEventEmitter', () => {
  let emitter: FluxilisEventEmitter;

  beforeEach(() => {
    emitter = new FluxilisEventEmitter();
  });

  // --- Basic Event Handling ---
  describe('Basic Event Handling', () => {
    it('should register and call listeners', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.emit('test', 'arg1', 'arg2');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return true when event has listeners', () => {
      emitter.on('test', vi.fn());
      const result = emitter.emit('test');
      expect(result).toBe(true);
    });

    it('should return false when event has no listeners', () => {
      const result = emitter.emit('test');
      expect(result).toBe(false);
    });

    it('should call multiple listeners for same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.emit('test');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should support symbol event names', () => {
      const eventSymbol = Symbol('test');
      const listener = vi.fn();

      emitter.on(eventSymbol, listener);
      emitter.emit(eventSymbol, 'data');

      expect(listener).toHaveBeenCalledWith('data');
    });
  });

  // --- Priority-based Listeners ---
  describe('Priority-based Listeners', () => {
    it('should call higher priority listeners first', () => {
      const order: string[] = [];

      emitter.on(
        'test',
        () => {
          order.push('low');
        },
        { priority: 0 },
      );
      emitter.on(
        'test',
        () => {
          order.push('high');
        },
        { priority: 10 },
      );
      emitter.on(
        'test',
        () => {
          order.push('medium');
        },
        { priority: 5 },
      );

      emitter.emit('test');

      expect(order).toEqual(['high', 'medium', 'low']);
    });

    it('should preserve insertion order for same priority', () => {
      const order: string[] = [];

      emitter.on(
        'test',
        () => {
          order.push('first');
        },
        { priority: 5 },
      );
      emitter.on(
        'test',
        () => {
          order.push('second');
        },
        { priority: 5 },
      );
      emitter.on(
        'test',
        () => {
          order.push('third');
        },
        { priority: 5 },
      );

      emitter.emit('test');

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should insert high priority listeners before existing lower ones', () => {
      const order: string[] = [];

      emitter.on(
        'test',
        () => {
          order.push('low1');
        },
        { priority: 1 },
      );
      emitter.on(
        'test',
        () => {
          order.push('low2');
        },
        { priority: 1 },
      );
      emitter.on(
        'test',
        () => {
          order.push('high');
        },
        { priority: 100 },
      );

      emitter.emit('test');

      expect(order).toEqual(['high', 'low1', 'low2']);
    });
  });

  // --- Once Listeners ---
  describe('Once Listeners', () => {
    it('should remove listener after first invocation', () => {
      const listener = vi.fn();

      emitter.once('test', listener);
      emitter.emit('test', 'first');
      emitter.emit('test', 'second');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('first');
    });

    it('should support priority with once', () => {
      const order: string[] = [];

      emitter.once(
        'test',
        () => {
          order.push('once-high');
        },
        10,
      );
      emitter.on('test', () => {
        order.push('regular');
      });

      emitter.emit('test');

      expect(order).toEqual(['once-high', 'regular']);
    });

    it('should work with on() and { once: true }', () => {
      const listener = vi.fn();

      emitter.on('test', listener, { once: true });
      emitter.emit('test');
      emitter.emit('test');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // --- Removing Listeners ---
  describe('Removing Listeners', () => {
    it('should remove specific listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.off('test', listener1);
      emitter.emit('test');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners for event when no listener specified', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.off('test');
      emitter.emit('test');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent listener gracefully', () => {
      const listener = vi.fn();
      expect(() => emitter.off('test', listener)).not.toThrow();
    });

    it('should handle removing from non-existent event gracefully', () => {
      expect(() => emitter.off('nonexistent')).not.toThrow();
    });
  });

  // --- removeAllListeners ---
  describe('removeAllListeners()', () => {
    it('should remove all listeners for specific event', () => {
      emitter.on('test1', vi.fn());
      emitter.on('test2', vi.fn());

      emitter.removeAllListeners('test1');

      expect(emitter.listenerCount('test1')).toBe(0);
      expect(emitter.listenerCount('test2')).toBe(1);
    });

    it('should remove all listeners when no event specified', () => {
      emitter.on('test1', vi.fn());
      emitter.on('test2', vi.fn());

      emitter.removeAllListeners();

      expect(emitter.eventNames()).toEqual([]);
    });
  });

  // --- Max Listeners Warning ---
  describe('Max Listeners Warning', () => {
    it('should warn when exceeding max listeners', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      emitter.setMaxListeners(2);

      emitter.on('test', vi.fn());
      emitter.on('test', vi.fn());
      expect(warnSpy).not.toHaveBeenCalled();

      emitter.on('test', vi.fn());
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not warn when maxListeners is 0 (unlimited)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      emitter.setMaxListeners(0);

      for (let i = 0; i < 100; i++) {
        emitter.on('test', vi.fn());
      }

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should get and set max listeners', () => {
      expect(emitter.getMaxListeners()).toBe(10);

      emitter.setMaxListeners(50);
      expect(emitter.getMaxListeners()).toBe(50);
    });
  });

  // --- Async Event Handling ---
  describe('Async Event Handling', () => {
    describe('emitAsync()', () => {
      it('should wait for async listeners', async () => {
        const results: string[] = [];

        emitter.on('test', async () => {
          await new Promise((r) => setTimeout(r, 50));
          results.push('async1');
        });

        emitter.on('test', async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push('async2');
        });

        await emitter.emitAsync('test');

        expect(results).toContain('async1');
        expect(results).toContain('async2');
      });

      it('should return true when event has listeners', async () => {
        emitter.on('test', async () => {});
        const result = await emitter.emitAsync('test');
        expect(result).toBe(true);
      });

      it('should return false when event has no listeners', async () => {
        const result = await emitter.emitAsync('test');
        expect(result).toBe(false);
      });

      it('should remove once listeners after emitAsync', async () => {
        const listener = vi.fn();
        emitter.once('test', listener);

        await emitter.emitAsync('test');
        await emitter.emitAsync('test');

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    describe('asyncListeners option', () => {
      it('should log errors from async listeners when asyncListeners is true', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const asyncEmitter = new FluxilisEventEmitter({ asyncListeners: true });
        asyncEmitter.on('test', async () => {
          throw new Error('async error');
        });

        asyncEmitter.emit('test');

        // Wait for async handler to execute
        await new Promise((r) => setTimeout(r, 10));

        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });
    });
  });

  // --- Error Handling ---
  describe('Error Handling', () => {
    it('should catch and log errors from sync listeners', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.on('test', () => {
        throw new Error('sync error');
      });
      emitter.on('test', vi.fn());

      emitter.emit('test');

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should continue calling other listeners after error', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const afterError = vi.fn();

      emitter.on('test', () => {
        throw new Error('error');
      });
      emitter.on('test', afterError);

      emitter.emit('test');

      expect(afterError).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  // --- Utility Methods ---
  describe('Utility Methods', () => {
    describe('listeners()', () => {
      it('should return array of listeners', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();

        emitter.on('test', fn1);
        emitter.on('test', fn2);

        const listeners = emitter.listeners('test');

        expect(listeners).toHaveLength(2);
        expect(listeners).toContain(fn1);
        expect(listeners).toContain(fn2);
      });

      it('should return empty array for non-existent event', () => {
        expect(emitter.listeners('nonexistent')).toEqual([]);
      });
    });

    describe('listenerCount()', () => {
      it('should return correct count', () => {
        expect(emitter.listenerCount('test')).toBe(0);

        emitter.on('test', vi.fn());
        expect(emitter.listenerCount('test')).toBe(1);

        emitter.on('test', vi.fn());
        expect(emitter.listenerCount('test')).toBe(2);
      });
    });

    describe('eventNames()', () => {
      it('should return array of event names', () => {
        emitter.on('event1', vi.fn());
        emitter.on('event2', vi.fn());

        const names = emitter.eventNames();

        expect(names).toContain('event1');
        expect(names).toContain('event2');
      });

      it('should include symbol event names', () => {
        const sym = Symbol('test');
        emitter.on(sym, vi.fn());

        const names = emitter.eventNames();

        expect(names).toContain(sym);
      });
    });
  });

  // --- Chaining ---
  describe('Method Chaining', () => {
    it('should support chaining on()', () => {
      const result = emitter.on('test1', vi.fn()).on('test2', vi.fn());
      expect(result).toBe(emitter);
    });

    it('should support chaining once()', () => {
      const result = emitter.once('test1', vi.fn()).once('test2', vi.fn());
      expect(result).toBe(emitter);
    });

    it('should support chaining off()', () => {
      const result = emitter.off('test');
      expect(result).toBe(emitter);
    });

    it('should support chaining setMaxListeners()', () => {
      const result = emitter.setMaxListeners(100);
      expect(result).toBe(emitter);
    });

    it('should support chaining removeAllListeners()', () => {
      const result = emitter.removeAllListeners();
      expect(result).toBe(emitter);
    });
  });

  // --- Constructor Options ---
  describe('Constructor Options', () => {
    it('should accept maxListeners option', () => {
      const customEmitter = new FluxilisEventEmitter({ maxListeners: 5 });
      expect(customEmitter.getMaxListeners()).toBe(5);
    });

    it('should accept asyncListeners option', () => {
      // asyncListeners is internal, just verify it doesn't throw
      expect(() => new FluxilisEventEmitter({ asyncListeners: true })).not.toThrow();
    });
  });

  // --- Stress Tests ---
  describe('Stress Tests', () => {
    it('should handle 1000 listeners on same event', () => {
      // Disable max listeners warning for this test
      emitter.setMaxListeners(0);
      const callCount = vi.fn();

      for (let i = 0; i < 1000; i++) {
        emitter.on('stress', callCount);
      }

      expect(emitter.listenerCount('stress')).toBe(1000);

      emitter.emit('stress', 'data');

      expect(callCount).toHaveBeenCalledTimes(1000);
    });

    it('should handle rapid emit calls (10000 emits)', () => {
      const listener = vi.fn();
      emitter.on('rapid', listener);

      for (let i = 0; i < 10000; i++) {
        emitter.emit('rapid', i);
      }

      expect(listener).toHaveBeenCalledTimes(10000);
    });

    it('should handle many different event types (100 events)', () => {
      emitter.setMaxListeners(0);
      const listeners: ReturnType<typeof vi.fn>[] = [];

      for (let i = 0; i < 100; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        emitter.on(`event${i}`, listener);
      }

      // Emit all events
      for (let i = 0; i < 100; i++) {
        emitter.emit(`event${i}`, i);
      }

      // Verify all listeners called
      listeners.forEach((listener, i) => {
        expect(listener).toHaveBeenCalledWith(i);
      });

      expect(emitter.eventNames().length).toBe(100);
    });

    it('should handle priority sorting with many listeners', () => {
      emitter.setMaxListeners(0);
      const order: number[] = [];

      // Add 100 listeners with random priorities
      const priorities = Array.from({ length: 100 }, (_, i) => i);
      // Shuffle
      priorities.sort(() => Math.random() - 0.5);

      priorities.forEach((priority) => {
        emitter.on(
          'priority-stress',
          () => {
            order.push(priority);
          },
          { priority },
        );
      });

      emitter.emit('priority-stress');

      // Should be sorted in descending order (high priority first)
      expect(order.length).toBe(100);
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1]).toBeGreaterThanOrEqual(order[i]);
      }
    });

    it('should handle async emit with many async listeners', async () => {
      emitter.setMaxListeners(0);
      const results: number[] = [];

      for (let i = 0; i < 50; i++) {
        emitter.on('async-stress', async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          results.push(i);
        });
      }

      await emitter.emitAsync('async-stress');

      expect(results.length).toBe(50);
    });

    it('should handle rapid on/off cycles', () => {
      const listener = vi.fn();

      for (let i = 0; i < 1000; i++) {
        emitter.on('cycle', listener);
        emitter.off('cycle', listener);
      }

      expect(emitter.listenerCount('cycle')).toBe(0);

      // Final add
      emitter.on('cycle', listener);
      emitter.emit('cycle');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle many once listeners', () => {
      emitter.setMaxListeners(0);
      const results: number[] = [];

      for (let i = 0; i < 100; i++) {
        emitter.once('many-once', () => {
          results.push(i);
        });
      }

      expect(emitter.listenerCount('many-once')).toBe(100);

      emitter.emit('many-once');

      expect(results.length).toBe(100);
      expect(emitter.listenerCount('many-once')).toBe(0);
    });

    it('should handle symbol events at scale', () => {
      const symbols = Array.from({ length: 50 }, (_, i) => Symbol(`event-${i}`));
      const listeners: ReturnType<typeof vi.fn>[] = [];

      symbols.forEach((sym) => {
        const listener = vi.fn();
        listeners.push(listener);
        emitter.on(sym, listener);
      });

      symbols.forEach((sym, i) => {
        emitter.emit(sym, i);
      });

      listeners.forEach((listener, i) => {
        expect(listener).toHaveBeenCalledWith(i);
      });
    });
  });

  // --- Type-safe Events ---
  describe('Type-safe Events', () => {
    // Define typed event map for testing (using type instead of interface for index compatibility)
    type TestEvents = {
      request: (url: string, method: string) => void;
      response: (status: number, body: unknown) => void;
      error: (error: Error) => void;
      empty: () => void;
    };

    it('should work with typed event map', () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const listener = vi.fn();

      typedEmitter.on('request', listener);
      typedEmitter.emit('request', '/api/users', 'GET');

      expect(listener).toHaveBeenCalledWith('/api/users', 'GET');
    });

    it('should work with typed events and priority', () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const order: string[] = [];

      typedEmitter.on('request', () => order.push('low'), { priority: 0 });
      typedEmitter.on('request', () => order.push('high'), { priority: 100 });

      typedEmitter.emit('request', '/api', 'POST');

      expect(order).toEqual(['high', 'low']);
    });

    it('should work with typed once listeners', () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const listener = vi.fn();

      typedEmitter.once('response', listener);
      typedEmitter.emit('response', 200, { data: 'test' });
      typedEmitter.emit('response', 404, null);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(200, { data: 'test' });
    });

    it('should work with typed emitAsync', async () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const results: string[] = [];

      typedEmitter.on('request', async (url) => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(url);
      });

      await typedEmitter.emitAsync('request', '/async', 'GET');

      expect(results).toContain('/async');
    });

    it('should work with void events (no arguments)', () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const listener = vi.fn();

      typedEmitter.on('empty', listener);
      typedEmitter.emit('empty');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should work with error events', () => {
      const typedEmitter = new FluxilisEventEmitter<TestEvents>();
      const listener = vi.fn();
      const error = new Error('test error');

      typedEmitter.on('error', listener);
      typedEmitter.emit('error', error);

      expect(listener).toHaveBeenCalledWith(error);
    });

    it('should maintain backward compatibility (untyped usage)', () => {
      // This should work without specifying generic type
      const untypedEmitter = new FluxilisEventEmitter();
      const listener = vi.fn();

      untypedEmitter.on('anything', listener);
      untypedEmitter.emit('anything', 1, 'two', { three: 3 });

      expect(listener).toHaveBeenCalledWith(1, 'two', { three: 3 });
    });
  });

  // --- waitForEvent ---
  describe('waitForEvent()', () => {
    type WaitEvents = {
      signal: (data: string) => void;
      multi: (a: number, b: string) => void;
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve when event is emitted', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      // Emit after a short delay
      const waitPromise = typedEmitter.waitForEvent('signal');
      setTimeout(() => {
        typedEmitter.emit('signal', 'hello');
      }, 10);

      vi.advanceTimersByTime(10);
      const [data] = await waitPromise;
      expect(data).toBe('hello');
    });

    it('should resolve with multiple arguments', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      const waitPromise = typedEmitter.waitForEvent('multi');
      setTimeout(() => {
        typedEmitter.emit('multi', 42, 'test');
      }, 10);

      vi.advanceTimersByTime(10);
      const [num, str] = await waitPromise;
      expect(num).toBe(42);
      expect(str).toBe('test');
    });

    it('should reject on timeout', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      const waitPromise = typedEmitter.waitForEvent('signal', 50);
      vi.advanceTimersByTime(50);
      await expect(waitPromise).rejects.toThrow("Timeout waiting for event 'signal'");
    });

    it('should clear timeout when event is received', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      const waitPromise = typedEmitter.waitForEvent('signal', 1000);
      setTimeout(() => {
        typedEmitter.emit('signal', 'fast');
      }, 10);

      // Should resolve before timeout
      vi.advanceTimersByTime(10);
      const [data] = await waitPromise;
      expect(data).toBe('fast');
    });

    it('should remove listener on timeout', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      const waitPromise = typedEmitter.waitForEvent('signal', 10);
      vi.advanceTimersByTime(10);
      await expect(waitPromise).rejects.toThrow("Timeout waiting for event 'signal'");

      // Listener should be removed
      expect(typedEmitter.listenerCount('signal')).toBe(0);
    });

    it('should work without timeout (wait indefinitely)', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      // Emit immediately
      const waitPromise = typedEmitter.waitForEvent('signal');

      // Emit in next tick
      setImmediate(() => {
        typedEmitter.emit('signal', 'no-timeout');
      });

      await vi.runAllTimersAsync();
      const [data] = await waitPromise;
      expect(data).toBe('no-timeout');
    });

    it('should work with untyped emitter', async () => {
      const untypedEmitter = new FluxilisEventEmitter();

      const waitPromise = untypedEmitter.waitForEvent('custom');
      setTimeout(() => {
        untypedEmitter.emit('custom', 'value1', 'value2');
      }, 10);

      vi.advanceTimersByTime(10);
      const args = await waitPromise;
      expect(args).toEqual(['value1', 'value2']);
    });

    it('should only resolve once (one-time listener)', async () => {
      const typedEmitter = new FluxilisEventEmitter<WaitEvents>();

      const waitPromise = typedEmitter.waitForEvent('signal');
      setTimeout(() => {
        typedEmitter.emit('signal', 'first');
      }, 10);

      vi.advanceTimersByTime(10);
      const [data] = await waitPromise;
      expect(data).toBe('first');

      // Listener should be removed after first emit
      expect(typedEmitter.listenerCount('signal')).toBe(0);
    });
  });
});
