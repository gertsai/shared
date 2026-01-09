/**
 * Implementation of data stream with backpressure support.
 *
 * This module provides the DataStream class for building reactive data
 * processing pipelines with automatic backpressure handling.
 *
 * @packageDocumentation
 */

import { FluxilisEventEmitter } from '../events/FluxilisEventEmitter';
import type { DataStreamOptions, IDataStream } from '../types';
import { createDeferred, isPromise } from '../utils';

/**
 * Events emitted by DataStream.
 *
 * - `data` - Emitted when data is available to read
 * - `end` - Emitted when the stream has finished
 * - `error` - Emitted when an error occurs
 * - `drain` - Emitted when buffer drops below highWaterMark
 * - `close` - Emitted when the stream is closed
 * - `pause` - Emitted when the stream is paused
 * - `resume` - Emitted when the stream is resumed
 */
export type DataStreamEvent = 'data' | 'end' | 'error' | 'drain' | 'close' | 'pause' | 'resume';

/**
 * Function type for transforming data chunks in a pipeline.
 *
 * @typeParam T - Input data type
 * @typeParam R - Output data type
 *
 * @example Sync transformer
 * ```typescript
 * const double: DataTransformer<number, number> = (n) => n * 2;
 * ```
 *
 * @example Async transformer
 * ```typescript
 * const fetch: DataTransformer<string, Response> = async (url) => {
 *   return await fetch(url);
 * };
 * ```
 */
export type DataTransformer<T, R> = (chunk: T) => R | Promise<R>;

/**
 * Internal stream state tracking.
 * @internal
 */
interface StreamState {
  /** Stream ended flag */
  ended: boolean;
  /** Stream paused flag */
  paused: boolean;
  /** Buffer full flag */
  full: boolean;
}

/**
 * A backpressure-aware data stream with transformation pipeline support.
 *
 * DataStream provides a way to process data in a streaming fashion with
 * automatic backpressure handling. When the internal buffer fills up,
 * the stream signals to producers to slow down via the write() return value.
 *
 * @typeParam T - The type of data flowing through the stream
 *
 * @example Basic usage
 * ```typescript
 * const stream = new DataStream<string>();
 *
 * stream.on('data', (chunk) => console.log(chunk));
 * stream.on('end', () => console.log('Done'));
 *
 * stream.write('hello');
 * stream.write('world');
 * stream.end();
 * ```
 *
 * @example Transformation pipeline
 * ```typescript
 * const input = new DataStream<number>();
 *
 * const output = input
 *   .pipe((n) => n * 2)           // Double
 *   .pipe((n) => n.toString())    // Convert to string
 *   .pipe(async (s) => s.trim()); // Async transform
 *
 * output.on('data', console.log);
 * input.write(5); // Logs: "10"
 * ```
 *
 * @example Backpressure handling
 * ```typescript
 * const stream = new DataStream<Data>({ highWaterMark: 100 });
 *
 * for (const item of largeDataset) {
 *   const canContinue = stream.write(item);
 *   if (!canContinue) {
 *     await new Promise(resolve => stream.once('drain', resolve));
 *   }
 * }
 * stream.end();
 * ```
 */
export class DataStream<T> implements IDataStream<T> {
  /** Data buffer */
  private _buffer: T[] = [];

  /** Event emitter */
  private _eventEmitter: FluxilisEventEmitter;

  /** Stream options */
  private _options: Required<DataStreamOptions>;

  /** Stream state */
  private _state: StreamState = {
    ended: false,
    paused: false,
    full: false,
  };

  /** Deferred promise for drain event */
  private _drainPromise: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;

  /** Called to process each item */
  private _processItem: ((item: T) => Promise<void>) | null = null;

  /**
   * Creates a new DataStream instance.
   *
   * @param options - Configuration options for the stream
   * @param options.highWaterMark - Buffer size before backpressure kicks in (default: 1000)
   * @param options.errorMode - How to handle errors: 'throw', 'emit', or 'ignore' (default: 'emit')
   * @param options.autoEnd - Automatically end when source completes (default: false)
   *
   * @example Default configuration
   * ```typescript
   * const stream = new DataStream<string>();
   * ```
   *
   * @example Custom backpressure threshold
   * ```typescript
   * const stream = new DataStream<Data>({
   *   highWaterMark: 50,  // Lower threshold for memory-constrained environments
   *   errorMode: 'emit',
   * });
   * ```
   *
   * @example Strict error handling
   * ```typescript
   * const stream = new DataStream<Data>({
   *   errorMode: 'throw', // Throw errors instead of emitting
   * });
   * ```
   */
  constructor(options: DataStreamOptions = {}) {
    this._eventEmitter = new FluxilisEventEmitter({ asyncListeners: true });

    const highWaterMark = options.highWaterMark ?? 1000;
    const maxBufferSize = options.maxBufferSize ?? Infinity;

    // Validate: maxBufferSize must be >= highWaterMark
    if (maxBufferSize !== Infinity && maxBufferSize < highWaterMark) {
      throw new Error(
        `maxBufferSize (${maxBufferSize}) must be >= highWaterMark (${highWaterMark})`,
      );
    }

    // Set default options
    this._options = {
      highWaterMark,
      maxBufferSize,
      errorMode: options.errorMode ?? 'emit',
      autoEnd: options.autoEnd ?? false,
    };
  }

  /**
   * Writes data to the stream.
   *
   * Returns `true` if more data can be written immediately, or `false` if the
   * internal buffer has reached the highWaterMark (backpressure). When `false`
   * is returned, you should wait for the `drain` event before writing more data.
   *
   * @param chunk - The data to write to the stream
   * @returns `true` if the stream can accept more data, `false` if backpressure is active
   * @throws {Error} If writing to an ended stream (in 'throw' errorMode)
   *
   * @example Basic write
   * ```typescript
   * stream.write('hello');
   * stream.write('world');
   * ```
   *
   * @example Handling backpressure
   * ```typescript
   * const canContinue = stream.write(data);
   * if (!canContinue) {
   *   console.log('Buffer full, waiting for drain');
   *   await new Promise(resolve => stream.once('drain', resolve));
   * }
   * ```
   *
   * @example Writing from async iterator
   * ```typescript
   * for await (const item of asyncIterator) {
   *   const ok = stream.write(item);
   *   if (!ok) {
   *     await new Promise(r => stream.once('drain', r));
   *   }
   * }
   * stream.end();
   * ```
   */
  write(chunk: T): boolean {
    // Check if stream ended
    if (this._state.ended) {
      const error = new Error('Attempt to write to ended stream');
      this._handleError(error);
      return false;
    }

    // Check buffer overflow (hard limit)
    if (
      this._options.maxBufferSize !== Infinity &&
      this._buffer.length >= this._options.maxBufferSize
    ) {
      const error = new Error(
        `Buffer overflow: maxBufferSize (${this._options.maxBufferSize}) exceeded`,
      );
      this._handleError(error);
      return false;
    }

    // Check pause
    if (this._state.paused) {
      // Add to buffer even if paused
      this._buffer.push(chunk);
      this._checkBackpressure();
      return !this._state.full;
    }

    // If handler exists, pass data to it
    if (this._processItem) {
      // If buffer is full, add to buffer
      if (this._state.full) {
        this._buffer.push(chunk);
        return false;
      }

      // If buffer not empty, add to buffer
      if (this._buffer.length > 0) {
        this._buffer.push(chunk);
        this._checkBackpressure(); // FIX: Update backpressure state after push
        this._processNextItem();
        return !this._state.full;
      }

      // If buffer is empty, process immediately
      try {
        this._processItem(chunk)
          .then(() => {
            this._processDrain();
          })
          .catch((err) => {
            this._handleError(err);
          });
      } catch (err) {
        this._handleError(err instanceof Error ? err : new Error(String(err)));
        return false;
      }

      return true;
    } else {
      // If no handler, emit immediately unless buffering from pause
      if (this._buffer.length > 0) {
        this._buffer.push(chunk);
        this._flushBufferedData();
      } else {
        this._emitData(chunk);
      }
      return true;
    }
  }

  /**
   * Ends the data stream.
   *
   * For piped streams, waits for buffer to drain before emitting 'end'.
   * For non-piped streams, flushes buffer immediately (if not paused) before 'end'.
   * If paused with buffered data, 'end' will be emitted after resume() flushes the buffer.
   */
  end(): void {
    if (this._state.ended) {
      return;
    }

    this._state.ended = true;

    // If buffer not empty, defer 'end' until buffer is flushed
    if (this._buffer.length > 0) {
      if (this._processItem) {
        // Piped stream: process remaining items, 'end' emitted in _processNextItem
        this._processNextItem();
      } else if (!this._state.paused) {
        // Non-piped, not paused: flush immediately then emit end
        this._flushBufferedData();
        this._eventEmitter.emit('end');
      }
      // If paused with buffer: 'end' will be emitted after resume() flushes buffer
    } else {
      // Buffer empty: emit 'end' immediately
      this._eventEmitter.emit('end');
    }
  }

  /**
   * Creates a transformation pipeline by connecting a transformer to this stream.
   *
   * Returns a new stream that receives the transformed output. Multiple pipe()
   * calls can be chained to create complex processing pipelines. The transformer
   * can be synchronous or asynchronous.
   *
   * Backpressure is automatically propagated: if the output stream is full,
   * this stream will pause and resume when the output drains.
   *
   * @typeParam R - The output type after transformation
   * @param transform - Function to transform each chunk
   * @returns A new DataStream that receives the transformed data
   *
   * @example Simple transformation
   * ```typescript
   * const numbers = new DataStream<number>();
   * const doubled = numbers.pipe((n) => n * 2);
   * doubled.on('data', console.log);
   * numbers.write(5); // Logs: 10
   * ```
   *
   * @example Chained transformations
   * ```typescript
   * const output = input
   *   .pipe((data) => data.trim())
   *   .pipe((data) => data.toUpperCase())
   *   .pipe((data) => ({ text: data, timestamp: Date.now() }));
   * ```
   *
   * @example Async transformation
   * ```typescript
   * const enriched = stream.pipe(async (item) => {
   *   const details = await fetchDetails(item.id);
   *   return { ...item, details };
   * });
   * ```
   *
   * @example Error handling
   * ```typescript
   * const output = input.pipe((data) => {
   *   if (!isValid(data)) {
   *     throw new Error('Invalid data');
   *   }
   *   return process(data);
   * });
   * output.on('error', (err) => console.error(err));
   * ```
   */
  pipe<R>(transform: DataTransformer<T, R>): IDataStream<R> {
    const outputStream = new DataStream<R>(this._options);

    // Handler for input data
    this._processItem = async (item: T) => {
      try {
        // Call transformer
        const result = transform(item);

        // Handle async transformer
        const transformedValue = isPromise(result) ? await result : result;

        // Write to output stream
        const canContinue = outputStream.write(transformedValue);

        // If output stream reports backpressure, wait for drain
        if (!canContinue && !this._state.paused) {
          this._pause();
          await new Promise<void>((resolve) => {
            outputStream.once('drain', () => {
              this._resume();
              resolve();
            });
          });
        }
      } catch (err) {
        // Handle transformation errors
        this._handleError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Forward end and error events
    this.on('end', () => {
      if (outputStream._options.autoEnd) {
        outputStream.end();
      }
    });

    this.on('error', (err: unknown) => {
      outputStream.emit('error', err);
    });

    // If buffer already has data, start processing
    if (this._buffer.length > 0) {
      this._processNextItem();
    }

    return outputStream;
  }

  /**
   * Subscribes to stream events
   * @param event Event name
   * @param listener Event handler
   */
  on(event: DataStreamEvent, listener: (...args: unknown[]) => void): this {
    this._eventEmitter.on(event, listener);
    return this;
  }

  /**
   * One-time subscription to stream events
   * @param event Event name
   * @param listener Event handler
   */
  once(event: DataStreamEvent, listener: (...args: unknown[]) => void): this {
    this._eventEmitter.once(event, listener);
    return this;
  }

  /**
   * Unsubscribes from stream events
   * @param event Event name
   * @param listener Event handler
   */
  off(event: DataStreamEvent, listener?: (...args: unknown[]) => void): this {
    this._eventEmitter.off(event, listener);
    return this;
  }

  /**
   * Emits an event
   * @param event Event name
   * @param args Event arguments
   */
  emit(event: DataStreamEvent, ...args: unknown[]): boolean {
    return this._eventEmitter.emit(event, ...args);
  }

  /**
   * Pauses stream processing
   */
  pause(): this {
    if (!this._state.paused) {
      this._state.paused = true;
      this._eventEmitter.emit('pause');
    }
    return this;
  }

  /**
   * Resumes stream processing.
   *
   * If the stream was ended while paused, emits 'end' after flushing buffered data.
   */
  resume(): this {
    if (this._state.paused) {
      this._state.paused = false;
      this._eventEmitter.emit('resume');

      // If buffer has data, start processing
      if (this._buffer.length > 0) {
        if (this._processItem) {
          this._processNextItem();
          // Note: 'end' will be emitted in _processNextItem when buffer drains
        } else {
          this._flushBufferedData();
          // FIX: If stream was ended while paused, emit 'end' now after flush
          if (this._state.ended) {
            this._eventEmitter.emit('end');
          }
        }
      } else if (this._state.ended) {
        // FIX: Buffer empty but ended while paused - emit 'end' now
        this._eventEmitter.emit('end');
      }
    }
    return this;
  }

  /**
   * Closes the stream
   */
  close(): void {
    if (!this._state.ended) {
      this.end();
    }
    this._eventEmitter.emit('close');
    this._eventEmitter.removeAllListeners();
  }

  /**
   * Destroys the stream, releasing all resources.
   *
   * Unlike close(), destroy() immediately clears the buffer without
   * processing remaining items. Use this for error recovery or cleanup.
   *
   * @param error - Optional error to emit before destroying
   */
  destroy(error?: Error): void {
    // Emit error if provided
    if (error) {
      this._handleError(error);
    }

    // Clear buffer immediately (no flush)
    this._buffer.length = 0;

    // Mark as ended
    this._state.ended = true;

    // Resolve any pending drain promise
    if (this._drainPromise) {
      this._drainPromise.reject(new Error('Stream destroyed'));
      this._drainPromise = null;
    }

    // Emit close and cleanup
    this._eventEmitter.emit('close');
    this._eventEmitter.removeAllListeners();
  }

  /**
   * Returns the current buffer size.
   */
  get bufferSize(): number {
    return this._buffer.length;
  }

  /**
   * Checks if stream has ended
   */
  isEnded(): boolean {
    return this._state.ended;
  }

  /**
   * Checks if stream is paused
   */
  isPaused(): boolean {
    return this._state.paused;
  }

  /**
   * Processes next item from buffer
   */
  private _processNextItem(): void {
    // If stream paused or no handler or buffer empty, exit
    if (this._state.paused || !this._processItem || this._buffer.length === 0) {
      return;
    }

    // Take first item from buffer
    const item = this._buffer.shift()!;

    // Process it
    try {
      this._processItem(item)
        .then(() => {
          // Check backpressure
          const wasFullBefore = this._state.full;
          this._checkBackpressure();

          // If backpressure lifted, emit drain event
          if (wasFullBefore && !this._state.full) {
            this._processDrain();
          }

          // If buffer not empty and stream not paused, process next item
          if (this._buffer.length > 0 && !this._state.paused) {
            this._processNextItem();
          }

          // If buffer empty and stream ended, emit end event
          if (this._buffer.length === 0 && this._state.ended) {
            this._eventEmitter.emit('end');
          }
        })
        .catch((err) => {
          this._handleError(err);
        });
    } catch (err) {
      this._handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Checks backpressure
   */
  private _checkBackpressure(): void {
    // If buffer exceeds highWaterMark, set full flag
    const wasFull = this._state.full;
    this._state.full = this._buffer.length >= this._options.highWaterMark;

    // If backpressure state changed
    if (!wasFull && this._state.full) {
      // Create promise for drain
      if (!this._drainPromise) {
        const deferred = createDeferred<void>();
        this._drainPromise = {
          promise: deferred.promise,
          resolve: deferred.resolve,
          reject: deferred.reject,
        };
      }
    }
  }

  /**
   * Handles buffer release (drain)
   */
  private _processDrain(): void {
    if (!this._state.full && this._drainPromise) {
      this._eventEmitter.emit('drain');
      this._drainPromise.resolve();
      this._drainPromise = null;
    }
  }

  /**
   * Flushes buffered data for non-piped streams.
   */
  private _flushBufferedData(): void {
    if (this._buffer.length === 0) {
      return;
    }

    const wasFull = this._state.full;
    while (this._buffer.length > 0) {
      const item = this._buffer.shift()!;
      this._emitData(item);
    }

    this._checkBackpressure();
    if (wasFull && !this._state.full) {
      this._processDrain();
    }
  }

  /**
   * Pauses stream processing (internal method)
   */
  private _pause(): void {
    this.pause();
  }

  /**
   * Resumes stream processing (internal method)
   */
  private _resume(): void {
    this.resume();
  }

  /**
   * Emits data event
   * @param data Data
   */
  private _emitData(data: T): void {
    this._eventEmitter.emit('data', data);
  }

  /**
   * Handles error in stream
   * @param error Error
   */
  private _handleError(error: Error): void {
    switch (this._options.errorMode) {
      case 'throw':
        throw error;
      case 'emit':
        this._eventEmitter.emit('error', error);
        break;
      case 'ignore':
        // Ignore error
        break;
    }
  }
}
