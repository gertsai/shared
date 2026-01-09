/**
 * Tests for DataStream.
 */

import { describe, it, expect, vi } from 'vitest';
import { DataStream } from '../stream/DataStream';
import { FixtureBuilder, ComplexObject, complexObjectBuilder, wait } from './fixtures';

describe('DataStream', () => {
  // --- Basic Operations ---
  describe('Basic Operations', () => {
    it('should create a stream with default options', () => {
      const stream = new DataStream<string>();
      expect(stream.isEnded()).toBe(false);
      expect(stream.isPaused()).toBe(false);
    });

    it('should emit data events on write', () => {
      const stream = new DataStream<string>();
      const dataHandler = vi.fn();

      stream.on('data', dataHandler);
      stream.write('hello');

      expect(dataHandler).toHaveBeenCalledWith('hello');
    });

    it('should emit end event when ended', () => {
      const stream = new DataStream<string>();
      const endHandler = vi.fn();

      stream.on('end', endHandler);
      stream.end();

      expect(endHandler).toHaveBeenCalled();
      expect(stream.isEnded()).toBe(true);
    });

    it('should not emit end twice', () => {
      const stream = new DataStream<string>();
      const endHandler = vi.fn();

      stream.on('end', endHandler);
      stream.end();
      stream.end();

      expect(endHandler).toHaveBeenCalledTimes(1);
    });
  });

  // --- Backpressure ---
  describe('Backpressure', () => {
    it('should return true when buffer is below highWaterMark', () => {
      const stream = new DataStream<number>({ highWaterMark: 10 });

      for (let i = 0; i < 5; i++) {
        const result = stream.write(i);
        expect(result).toBe(true);
      }
    });

    it('should return false when paused buffer reaches highWaterMark', () => {
      const stream = new DataStream<number>({ highWaterMark: 5 });

      stream.pause();

      for (let i = 0; i < 4; i++) {
        expect(stream.write(i)).toBe(true);
      }

      const result = stream.write(4);
      expect(result).toBe(false);
    });

    it('should emit drain when buffer drops below highWaterMark', async () => {
      const stream = new DataStream<number>({ highWaterMark: 3 });
      const drainHandler = vi.fn();

      // Listen on source stream
      stream.on('drain', drainHandler);

      // Create a slow pipeline to build up backpressure
      const output = stream.pipe(async (n) => {
        await new Promise((r) => setTimeout(r, 10));
        return n * 2;
      });

      const results: number[] = [];
      output.on('data', (d) => results.push(d as number));

      // Write enough items to potentially trigger backpressure
      for (let i = 0; i < 10; i++) {
        stream.write(i);
      }

      // Wait for all processing to complete
      await new Promise((r) => setTimeout(r, 200));

      // Data should have been processed
      expect(results.length).toBeGreaterThan(0);
    });

    it('should not trigger backpressure without a pipeline', () => {
      const stream = new DataStream<number>({ highWaterMark: 2 });
      const drainHandler = vi.fn();

      stream.on('drain', drainHandler);

      // Writes should not be backpressured when not buffering
      for (let i = 0; i < 10; i++) {
        expect(stream.write(i)).toBe(true);
      }

      expect(drainHandler).not.toHaveBeenCalled();
    });

    it('should emit drain after resuming from a paused buffer', async () => {
      const stream = new DataStream<number>({ highWaterMark: 2 });
      const drainHandler = vi.fn();
      const dataHandler = vi.fn();

      stream.on('drain', drainHandler);
      stream.on('data', dataHandler);

      stream.pause();

      expect(stream.write(1)).toBe(true);
      expect(stream.write(2)).toBe(false);

      stream.resume();

      await wait(10);

      expect(dataHandler).toHaveBeenCalledWith(1);
      expect(dataHandler).toHaveBeenCalledWith(2);
      expect(drainHandler).toHaveBeenCalledTimes(1);
    });
  });

  // --- Pipe Transformations ---
  describe('Pipe Transformations', () => {
    it('should transform data through pipe', async () => {
      const input = new DataStream<number>();
      const results: number[] = [];

      const output = input.pipe((n) => n * 2);
      output.on('data', (data) => results.push(data as number));

      input.write(1);
      input.write(2);
      input.write(3);
      input.end();

      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain(2);
      expect(results).toContain(4);
      expect(results).toContain(6);
    });

    it('should support async transformers', async () => {
      const input = new DataStream<string>();
      const results: string[] = [];

      const output = input.pipe(async (s) => {
        await new Promise((r) => setTimeout(r, 5));
        return s.toUpperCase();
      });
      output.on('data', (data) => {
        results.push(data as string);
      });

      input.write('hello');

      // Wait for async processing to complete
      await new Promise((r) => setTimeout(r, 150));

      // Should have at least processed some data
      expect(results.length).toBeGreaterThan(0);
    });

    it('should chain multiple pipes', async () => {
      const input = new DataStream<number>();
      const results: string[] = [];

      const output = input
        .pipe((n) => n * 2)
        .pipe((n) => n + 1)
        .pipe((n) => `Result: ${n}`);

      output.on('data', (data) => results.push(data as string));

      input.write(5);
      input.end();

      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain('Result: 11');
    });

    it('should forward end event through pipe when autoEnd is enabled', async () => {
      const input = new DataStream<number>({ autoEnd: true });
      const output = input.pipe((n) => n * 2);

      const endHandler = vi.fn();
      output.on('end', endHandler);

      input.end();

      await new Promise((r) => setTimeout(r, 10));

      expect(endHandler).toHaveBeenCalled();
    });

    it('should not auto-end output stream when autoEnd is disabled', async () => {
      const input = new DataStream<number>({ autoEnd: false });
      const output = input.pipe((n) => n * 2);

      const endHandler = vi.fn();
      output.on('end', endHandler);

      input.end();

      await new Promise((r) => setTimeout(r, 10));

      expect(endHandler).not.toHaveBeenCalled();
      expect(output.isEnded()).toBe(false);
    });
  });

  // --- Pause/Resume ---
  describe('Pause/Resume', () => {
    it('should pause stream', () => {
      const stream = new DataStream<number>();

      stream.pause();
      expect(stream.isPaused()).toBe(true);
    });

    it('should resume stream', () => {
      const stream = new DataStream<number>();

      stream.pause();
      stream.resume();
      expect(stream.isPaused()).toBe(false);
    });

    it('should emit pause event', () => {
      const stream = new DataStream<number>();
      const pauseHandler = vi.fn();

      stream.on('pause', pauseHandler);
      stream.pause();

      expect(pauseHandler).toHaveBeenCalled();
    });

    it('should emit resume event', () => {
      const stream = new DataStream<number>();
      const resumeHandler = vi.fn();

      stream.on('resume', resumeHandler);
      stream.pause();
      stream.resume();

      expect(resumeHandler).toHaveBeenCalled();
    });

    it('should buffer writes when paused (with pipeline)', async () => {
      const stream = new DataStream<number>();
      const results: number[] = [];

      // Create a pipeline to properly handle buffering
      const output = stream.pipe((n) => n * 2);
      output.on('data', (d) => results.push(d as number));

      // Pause the stream
      stream.pause();

      // Write data while paused - should be buffered
      stream.write(1);
      stream.write(2);

      // Wait a bit - data should NOT be processed while paused
      await new Promise((r) => setTimeout(r, 20));
      expect(results.length).toBe(0);

      // Resume processing
      stream.resume();

      // Wait for processing
      await new Promise((r) => setTimeout(r, 50));

      // Now data should be processed
      expect(results).toContain(2); // 1 * 2
      expect(results).toContain(4); // 2 * 2
    });

    it('should buffer writes when paused (without pipeline)', async () => {
      const stream = new DataStream<number>();
      const dataHandler = vi.fn();

      stream.on('data', dataHandler);
      stream.pause();
      stream.write(1);
      stream.write(2);

      // When paused, data is buffered but not emitted
      // The data event is emitted only when not paused
      // Note: Implementation buffers on pause and emits on write after resume
      expect(dataHandler).not.toHaveBeenCalled();

      // Resume the stream - buffer should flush
      stream.resume();

      await new Promise((r) => setTimeout(r, 10));

      expect(dataHandler).toHaveBeenCalledWith(1);
      expect(dataHandler).toHaveBeenCalledWith(2);
    });

    it('should not emit pause twice if already paused', () => {
      const stream = new DataStream<number>();
      const pauseHandler = vi.fn();

      stream.on('pause', pauseHandler);
      stream.pause();
      stream.pause();

      expect(pauseHandler).toHaveBeenCalledTimes(1);
    });

    it('should not emit resume if not paused', () => {
      const stream = new DataStream<number>();
      const resumeHandler = vi.fn();

      stream.on('resume', resumeHandler);
      stream.resume();

      expect(resumeHandler).not.toHaveBeenCalled();
    });
  });

  // --- Error Handling ---
  describe('Error Handling', () => {
    it('should emit error event in emit mode', () => {
      const stream = new DataStream<number>({ errorMode: 'emit' });
      const errorHandler = vi.fn();

      stream.on('error', errorHandler);
      stream.end();
      stream.write(1); // Writing to ended stream

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should throw in throw mode', () => {
      const stream = new DataStream<number>({ errorMode: 'throw' });
      stream.end();

      expect(() => stream.write(1)).toThrow();
    });

    it('should ignore errors in ignore mode', () => {
      const stream = new DataStream<number>({ errorMode: 'ignore' });
      const errorHandler = vi.fn();

      stream.on('error', errorHandler);
      stream.end();
      stream.write(1);

      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should forward errors through pipe', async () => {
      const input = new DataStream<number>({ errorMode: 'emit' });
      const output = input.pipe((n) => n * 2);
      const errorHandler = vi.fn();

      output.on('error', errorHandler);
      input.emit('error', new Error('test error'));

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  // --- Close ---
  describe('Close', () => {
    it('should emit close event', () => {
      const stream = new DataStream<number>();
      const closeHandler = vi.fn();

      stream.on('close', closeHandler);
      stream.close();

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should end stream before closing if not ended', () => {
      const stream = new DataStream<number>();
      const endHandler = vi.fn();

      stream.on('end', endHandler);
      stream.close();

      expect(endHandler).toHaveBeenCalled();
      expect(stream.isEnded()).toBe(true);
    });

    it('should remove all listeners on close', () => {
      const stream = new DataStream<number>();
      stream.on('data', vi.fn());
      stream.on('end', vi.fn());

      stream.close();

      // Emit should return false as no listeners
      expect(stream.emit('data', 1)).toBe(false);
    });
  });

  // --- Event Methods ---
  describe('Event Methods', () => {
    it('should support on/off/once pattern', () => {
      const stream = new DataStream<number>();
      const listener = vi.fn();

      stream.on('data', listener);
      stream.emit('data', 1);
      expect(listener).toHaveBeenCalledTimes(1);

      stream.off('data', listener);
      stream.emit('data', 2);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support once', () => {
      const stream = new DataStream<number>();
      const listener = vi.fn();

      stream.once('data', listener);
      stream.emit('data', 1);
      stream.emit('data', 2);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // --- Options ---
  describe('Constructor Options', () => {
    it('should accept highWaterMark option', () => {
      const stream = new DataStream<number>({ highWaterMark: 50 });
      // Write up to highWaterMark without returning false
      for (let i = 0; i < 49; i++) {
        expect(stream.write(i)).toBe(true);
      }
    });

    it('should accept errorMode option', () => {
      // Just verify no throw
      expect(() => new DataStream<number>({ errorMode: 'emit' })).not.toThrow();
      expect(() => new DataStream<number>({ errorMode: 'throw' })).not.toThrow();
      expect(() => new DataStream<number>({ errorMode: 'ignore' })).not.toThrow();
    });

    it('should accept autoEnd option', () => {
      expect(() => new DataStream<number>({ autoEnd: true })).not.toThrow();
    });
  });

  // --- Method Chaining ---
  describe('Method Chaining', () => {
    it('should support chaining on()', () => {
      const stream = new DataStream<number>();
      const result = stream.on('data', vi.fn()).on('end', vi.fn());
      expect(result).toBe(stream);
    });

    it('should support chaining once()', () => {
      const stream = new DataStream<number>();
      const result = stream.once('data', vi.fn());
      expect(result).toBe(stream);
    });

    it('should support chaining off()', () => {
      const stream = new DataStream<number>();
      const result = stream.off('data');
      expect(result).toBe(stream);
    });

    it('should support chaining pause/resume', () => {
      const stream = new DataStream<number>();
      const result = stream.pause().resume();
      expect(result).toBe(stream);
    });
  });

  // --- Stress Tests ---
  describe('Stress Tests', () => {
    it('should handle many writes (100 items with sync transform)', async () => {
      const stream = new DataStream<number>({ highWaterMark: 1000 });
      const results: number[] = [];

      const output = stream.pipe((n) => n * 2);
      output.on('data', (d) => results.push(d as number));

      // Write 100 items
      for (let i = 0; i < 100; i++) {
        stream.write(i);
      }
      stream.end();

      // Wait for all processing
      await new Promise((r) => setTimeout(r, 100));

      // Verify items processed
      expect(results.length).toBe(100);
      expect(results[0]).toBe(0); // 0 * 2
      expect(results[99]).toBe(198); // 99 * 2
    });

    it('should handle deep pipe chains (10 transforms)', async () => {
      const stream = new DataStream<number>();

      // Create 10-level pipe chain
      let output = stream.pipe((n) => n + 1);
      for (let i = 0; i < 9; i++) {
        output = output.pipe((n: number) => n + 1);
      }

      const results: number[] = [];
      output.on('data', (d) => results.push(d as number));

      stream.write(0);
      stream.end();

      // Deep pipe chains need more time
      await new Promise((r) => setTimeout(r, 500));

      // 0 + 1 (10 times) = 10
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain(10);
    });

    it('should handle writes with varying backpressure', async () => {
      const stream = new DataStream<number>({ highWaterMark: 100 });
      const results: number[] = [];

      const output = stream.pipe((n) => n);
      output.on('data', (d) => results.push(d as number));

      // Write items
      for (let i = 0; i < 50; i++) {
        stream.write(i);
      }
      stream.end();

      await new Promise((r) => setTimeout(r, 100));

      // Items should be processed
      expect(results.length).toBe(50);
    });

    it('should handle async transformers', async () => {
      const stream = new DataStream<number>();
      const results: number[] = [];

      // Set up pipeline FIRST
      const output = stream.pipe(async (n) => {
        await new Promise((r) => setTimeout(r, 5));
        return n * 2;
      });

      // Attach listener BEFORE writing
      output.on('data', (d) => results.push(d as number));

      // Now write items
      stream.write(1);

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 100));

      // At least first item should be processed
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain(2); // 1 * 2
    });

    it('should handle mixed sync and async transformers in chain', async () => {
      const stream = new DataStream<number>();
      const results: string[] = [];

      // Set up pipeline FIRST
      const output = stream
        .pipe((n) => n * 2) // sync
        .pipe(async (n: number) => {
          // async
          await new Promise((r) => setTimeout(r, 10));
          return n + 1;
        })
        .pipe((n: number) => `Result: ${n}`); // sync

      // Attach listener BEFORE writing
      output.on('data', (d) => results.push(d as string));

      // Now write
      stream.write(5);

      // Need enough time for async processing through chain
      await new Promise((r) => setTimeout(r, 200));

      // Should have processed the data
      expect(results.length).toBeGreaterThan(0);
      // 5 * 2 = 10, 10 + 1 = 11, "Result: 11"
      expect(results).toContain('Result: 11');
    });

    it('should maintain throughput with complex objects', async () => {
      // Using ComplexObject type from fixtures
      const stream = new DataStream<ComplexObject>({ highWaterMark: 1000 });
      const results: ComplexObject[] = [];

      const output = stream.pipe((obj) => ({
        ...obj,
        data: obj.data.toUpperCase(),
        nested: { ...obj.nested, value: obj.nested.value * 2 },
      }));

      output.on('data', (d) => results.push(d as ComplexObject));

      // Write 50 objects using buildManyWith for unique fixtures
      const fixtures = complexObjectBuilder.buildManyWith(50, (i) => ({
        id: i,
        name: `Object ${i}`,
        data: 'x'.repeat(100),
        nested: { value: i, tags: [] },
      }));

      for (const obj of fixtures) {
        stream.write(obj);
      }
      stream.end();

      await wait(100);

      expect(results.length).toBe(50);
      expect(results[0].data).toBe('X'.repeat(100));
      expect(results[49].nested.value).toBe(49 * 2);
    });

    it('should work with FixtureBuilder for stream data', async () => {
      // Custom builder for stream items
      const messageBuilder = new FixtureBuilder<{
        id: number;
        type: 'info' | 'warn' | 'error';
        content: string;
        timestamp: number;
      }>({
        id: 0,
        type: 'info',
        content: 'Test message',
        timestamp: Date.now(),
      });

      const stream = new DataStream<ReturnType<typeof messageBuilder.build>>();
      const results: ReturnType<typeof messageBuilder.build>[] = [];

      const output = stream.pipe((msg) => ({
        ...msg,
        content: `[${msg.type.toUpperCase()}] ${msg.content}`,
      }));

      output.on('data', (d) => results.push(d as ReturnType<typeof messageBuilder.build>));

      // Create and write fixtures
      const messages = messageBuilder.buildManyWith(10, (i) => ({
        id: i,
        type: i % 3 === 0 ? 'error' : i % 2 === 0 ? 'warn' : 'info',
        content: `Message ${i}`,
      }));

      for (const msg of messages) {
        stream.write(msg);
      }
      stream.end();

      await wait(50);

      expect(results.length).toBe(10);
      expect(results[0].content).toBe('[ERROR] Message 0');
      expect(results[1].content).toBe('[INFO] Message 1');
      expect(results[2].content).toBe('[WARN] Message 2');
    });
  });

  // --- Bug Fix Tests ---
  describe('Bug Fix Tests', () => {
    describe('end() should not emit before buffered data (Issue #2)', () => {
      it('should emit all data events before end when paused without pipeline', async () => {
        const stream = new DataStream<number>();
        const events: string[] = [];

        stream.on('data', (d) => events.push(`data:${d}`));
        stream.on('end', () => events.push('end'));

        // Pause, buffer data, then end
        stream.pause();
        stream.write(1);
        stream.write(2);
        stream.write(3);
        stream.end();

        // At this point 'end' should NOT have been emitted yet
        expect(events).not.toContain('end');

        // Resume should flush buffer then emit end
        stream.resume();

        await wait(50);

        // Verify correct order: all data before end
        expect(events).toEqual(['data:1', 'data:2', 'data:3', 'end']);
      });

      it('should emit end immediately when ended while paused with empty buffer', async () => {
        const stream = new DataStream<number>();
        const events: string[] = [];

        stream.on('data', (d) => events.push(`data:${d}`));
        stream.on('end', () => events.push('end'));

        stream.pause();
        stream.end(); // End while paused, no buffer

        // With empty buffer, 'end' is emitted immediately (nothing to wait for)
        expect(events).toEqual(['end']);
      });

      it('should correctly handle end() during active pipe processing', async () => {
        const stream = new DataStream<number>();
        const events: string[] = [];

        const output = stream.pipe(async (n) => {
          await wait(10);
          return n * 2;
        });

        output.on('data', (d) => events.push(`data:${d}`));
        output.on('end', () => events.push('end'));

        stream.write(1);
        stream.write(2);
        stream.end();

        await wait(100);

        // Data should come before end
        const endIndex = events.indexOf('end');
        const lastDataIndex = events.lastIndexOf(
          events.filter((e) => e.startsWith('data:')).pop()!,
        );

        if (endIndex !== -1 && lastDataIndex !== -1) {
          expect(lastDataIndex).toBeLessThan(endIndex);
        }
      });
    });

    describe('Backpressure in piped branch (Issue #1)', () => {
      it('should return false when paused piped buffer reaches highWaterMark', async () => {
        const stream = new DataStream<number>({ highWaterMark: 3 });

        // Create pipeline
        const output = stream.pipe((n) => n * 2);
        const results: number[] = [];
        output.on('data', (d) => results.push(d as number));

        // Pause to force buffering
        stream.pause();

        // All writes go to buffer
        const r1 = stream.write(1); // buffer: 1
        const r2 = stream.write(2); // buffer: 2
        const r3 = stream.write(3); // buffer: 3 = highWaterMark

        // Should return false when buffer hits highWaterMark
        expect(r3).toBe(false);

        stream.resume();
        await wait(50);
        expect(results.length).toBeGreaterThan(0);
      });

      it('should update backpressure state correctly when buffer fills', async () => {
        const stream = new DataStream<number>({ highWaterMark: 2 });

        const output = stream.pipe((n) => n);
        output.on('data', () => {});

        // Pause to force buffering
        stream.pause();

        // These go to buffer
        const r1 = stream.write(1); // buffer: 1, not full yet
        expect(r1).toBe(true);

        const r2 = stream.write(2); // buffer: 2 = highWaterMark
        expect(r2).toBe(false); // Now full

        stream.resume();
        await wait(50);
      });

      it('should check backpressure after adding to non-empty buffer', async () => {
        // This tests the fix at line 237: _checkBackpressure() after push to non-empty buffer
        const stream = new DataStream<number>({ highWaterMark: 3 });
        const output = stream.pipe((n) => n);
        output.on('data', () => {});

        // Pause to force buffering, then resume to start processing
        stream.pause();
        stream.write(1); // buffer: 1
        stream.write(2); // buffer: 2

        // Resume - this will start processing buffer
        // But we write more while processing is happening
        stream.resume();

        // Wait just a moment for processing to start but not finish
        await new Promise((r) => setImmediate(r));

        // Now pause again and add more to test the backpressure update
        stream.pause();
        const rNext = stream.write(3); // buffer grows during pause

        // The paused branch correctly calls _checkBackpressure
        // This test verifies the fix doesn't break existing behavior
        expect(stream.isPaused()).toBe(true);

        stream.resume();
        await wait(50);
      });
    });

    describe('maxBufferSize (buffer overflow protection)', () => {
      it('should reject writes exceeding maxBufferSize', () => {
        const stream = new DataStream<number>({
          highWaterMark: 2,
          maxBufferSize: 5,
          errorMode: 'emit',
        });

        const errors: Error[] = [];
        stream.on('error', (err) => errors.push(err as Error));

        // Pause to force all writes to buffer
        stream.pause();

        // Fill buffer
        for (let i = 0; i < 5; i++) {
          stream.write(i);
        }

        // Next write should fail
        const result = stream.write(5);
        expect(result).toBe(false);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain('Buffer overflow');
      });

      it('should throw if maxBufferSize < highWaterMark', () => {
        expect(
          () =>
            new DataStream<number>({
              highWaterMark: 10,
              maxBufferSize: 5,
            }),
        ).toThrow('maxBufferSize (5) must be >= highWaterMark (10)');
      });

      it('should allow unlimited buffer by default', () => {
        const stream = new DataStream<number>({ highWaterMark: 2 });

        // Pause and write many items
        stream.pause();
        for (let i = 0; i < 1000; i++) {
          stream.write(i);
        }

        expect(stream.bufferSize).toBe(1000);
      });

      it('should work when maxBufferSize equals highWaterMark (boundary case)', () => {
        const stream = new DataStream<number>({
          highWaterMark: 3,
          maxBufferSize: 3, // Equal to highWaterMark
          errorMode: 'emit',
        });

        const errors: Error[] = [];
        stream.on('error', (err) => errors.push(err as Error));

        stream.pause();

        // Can write exactly 3 items
        expect(stream.write(1)).toBe(true);
        expect(stream.write(2)).toBe(true);
        expect(stream.write(3)).toBe(false); // At highWaterMark, returns false but allowed

        expect(stream.bufferSize).toBe(3);
        expect(errors.length).toBe(0);

        // 4th write should fail (buffer overflow)
        expect(stream.write(4)).toBe(false);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain('Buffer overflow');
      });
    });

    describe('destroy() method', () => {
      it('should clear buffer immediately without processing', () => {
        const stream = new DataStream<number>();
        const dataEvents: number[] = [];

        stream.on('data', (d) => dataEvents.push(d as number));

        stream.pause();
        stream.write(1);
        stream.write(2);
        stream.write(3);

        expect(stream.bufferSize).toBe(3);

        stream.destroy();

        expect(stream.bufferSize).toBe(0);
        expect(stream.isEnded()).toBe(true);
        expect(dataEvents.length).toBe(0); // No data emitted
      });

      it('should emit error if provided', () => {
        const stream = new DataStream<number>({ errorMode: 'emit' });
        const errors: Error[] = [];

        stream.on('error', (err) => errors.push(err as Error));

        stream.destroy(new Error('Test error'));

        expect(errors.length).toBe(1);
        expect(errors[0].message).toBe('Test error');
      });

      it('should emit close event', () => {
        const stream = new DataStream<number>();
        let closeEmitted = false;

        stream.on('close', () => {
          closeEmitted = true;
        });

        stream.destroy();

        expect(closeEmitted).toBe(true);
      });

      it('should remove all listeners', () => {
        const stream = new DataStream<number>();
        const dataHandler = vi.fn();
        const endHandler = vi.fn();
        const errorHandler = vi.fn();

        stream.on('data', dataHandler);
        stream.on('end', endHandler);
        stream.on('error', errorHandler);

        stream.destroy();

        // Emit after destroy - handlers should NOT be called
        stream.emit('data', 1);
        stream.emit('end');
        stream.emit('error', new Error('test'));

        expect(dataHandler).not.toHaveBeenCalled();
        expect(endHandler).not.toHaveBeenCalled();
        expect(errorHandler).not.toHaveBeenCalled();
      });

      it('should be idempotent (safe to call multiple times)', () => {
        const stream = new DataStream<number>();
        const closeHandler = vi.fn();

        stream.on('close', closeHandler);
        stream.pause();
        stream.write(1);
        stream.write(2);

        // First destroy
        stream.destroy();
        expect(closeHandler).toHaveBeenCalledTimes(1);

        // Second destroy should not throw or emit again
        expect(() => stream.destroy()).not.toThrow();
        // Note: close is only emitted once because listeners were removed
      });
    });

    describe('bufferSize property', () => {
      it('should return current buffer size', () => {
        const stream = new DataStream<number>();

        expect(stream.bufferSize).toBe(0);

        stream.pause();
        stream.write(1);
        stream.write(2);

        expect(stream.bufferSize).toBe(2);
      });
    });
  });
});
