/**
 * Fast FIFO queue with amortized O(1) operations.
 *
 * Standard Array.shift() is O(N) because it re-indexes all elements.
 * This implementation uses index tracking with periodic compaction
 * to achieve amortized O(1) for both push and shift.
 *
 * @typeParam T - Type of items in the queue
 *
 * @example
 * ```typescript
 * const queue = new FastFIFO<number>();
 * queue.push(1);
 * queue.push(2);
 * queue.push(3);
 *
 * queue.shift(); // 1 (O(1))
 * queue.shift(); // 2 (O(1))
 * queue.length;  // 1
 * ```
 */
export class FastFIFO<T> {
  /** Internal array buffer */
  private _buffer: T[] = [];

  /** Head index (next item to dequeue) */
  private _head = 0;

  /** Threshold for compaction (prevents unbounded memory growth) */
  private readonly _compactThreshold: number;

  /**
   * Creates a new FastFIFO queue.
   *
   * @param compactThreshold - Number of "dead" slots before compaction (default: 1024)
   */
  constructor(compactThreshold = 1024) {
    this._compactThreshold = compactThreshold;
  }

  /**
   * Adds an item to the end of the queue.
   * Complexity: O(1) amortized
   *
   * @param item - Item to add
   */
  push(item: T): void {
    this._buffer.push(item);
  }

  /**
   * Removes and returns the first item from the queue.
   * Complexity: O(1) amortized (occasional O(N) compaction)
   *
   * @returns The first item, or undefined if queue is empty
   */
  shift(): T | undefined {
    if (this._head >= this._buffer.length) {
      return undefined;
    }

    const item = this._buffer[this._head];
    // Release reference to allow GC
    this._buffer[this._head] = undefined as T;
    this._head++;

    // Compact when we have too many dead slots to prevent memory leak
    // Only compact when head is past threshold AND represents > 50% of buffer
    if (this._head >= this._compactThreshold && this._head > this._buffer.length / 2) {
      this._compact();
    }

    return item;
  }

  /**
   * Returns the first item without removing it.
   * Complexity: O(1)
   *
   * @returns The first item, or undefined if queue is empty
   */
  peek(): T | undefined {
    if (this._head >= this._buffer.length) {
      return undefined;
    }
    return this._buffer[this._head];
  }

  /**
   * Returns the number of items in the queue.
   */
  get length(): number {
    return this._buffer.length - this._head;
  }

  /**
   * Returns true if the queue is empty.
   */
  get isEmpty(): boolean {
    return this._head >= this._buffer.length;
  }

  /**
   * Clears all items from the queue.
   */
  clear(): void {
    this._buffer.length = 0;
    this._head = 0;
  }

  /**
   * Compacts the internal buffer by removing dead slots.
   * @internal
   */
  private _compact(): void {
    this._buffer = this._buffer.slice(this._head);
    this._head = 0;
  }

  /**
   * Iterates over all items in the queue (without removing them).
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = this._head; i < this._buffer.length; i++) {
      // bounds guaranteed by loop condition i < this._buffer.length
      yield this._buffer[i]!;
    }
  }

  /**
   * Converts queue to array (creates a copy).
   */
  toArray(): T[] {
    return this._buffer.slice(this._head);
  }
}
