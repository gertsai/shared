/**
 * OrderedMap - Map that maintains insertion order with O(1) access
 * Combines benefits of Map (key-value pairs) with predictable iteration order
 *
 * @module specialized/OrderedMap
 */

import { MutableCollection } from '../core/MutableCollection';

/**
 * Internal node for doubly-linked list
 * @internal
 */
class OrderNode<K, V> {
  constructor(
    public key: K,
    public value: V,
    public prev: OrderNode<K, V> | null = null,
    public next: OrderNode<K, V> | null = null,
  ) {}
}

/**
 * Map that maintains insertion order with efficient operations
 *
 * @template K - The type of keys
 * @template V - The type of values
 *
 * @example
 * ```typescript
 * const map = new OrderedMap<string, number>();
 * map.set('first', 1);
 * map.set('second', 2);
 * map.set('third', 3);
 *
 * // Iteration preserves insertion order
 * for (const [key, value] of map) {
 *   console.log(key, value); // first 1, second 2, third 3
 * }
 *
 * // Positional access
 * map.entryAt(0); // ['first', 1]
 * map.moveToFront('third'); // Reorders: third, first, second
 * ```
 *
 * @class OrderedMap
 * @extends {MutableCollection<K, V>}
 */
export class OrderedMap<K, V> extends MutableCollection<K, V> {
  private nodeMap: Map<K, OrderNode<K, V>> = new Map();
  private head: OrderNode<K, V> | null = null;
  private tail: OrderNode<K, V> | null = null;

  constructor(entries?: Iterable<[K, V]>) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Set a key-value pair, maintaining order
   * If key exists, updates value without changing position
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns This collection for chaining
   * @complexity O(1)
   */
  override set(key: K, value: V): this {
    const existingNode = this.nodeMap.get(key);

    if (existingNode) {
      // Update existing node value
      existingNode.value = value;
      this.data.set(key, value);
    } else {
      // Create new node and add to end
      const newNode = new OrderNode(key, value);

      if (this.tail) {
        this.tail.next = newNode;
        newNode.prev = this.tail;
        this.tail = newNode;
      } else {
        this.head = this.tail = newNode;
      }

      this.nodeMap.set(key, newNode);
      this.data.set(key, value);
    }

    return this;
  }

  /**
   * Delete a key and maintain order
   */
  override delete(key: K): boolean {
    const node = this.nodeMap.get(key);
    if (!node) {
      return false;
    }

    // Remove from linked list
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    // Remove from maps
    this.nodeMap.delete(key);
    return this.data.delete(key);
  }

  /**
   * Clear all entries
   */
  override clear(): void {
    super.clear();
    this.nodeMap.clear();
    this.head = null;
    this.tail = null;
  }

  override update(key: K, updater: (value: V | undefined) => V): this {
    const nextValue = updater(this.data.get(key));
    return this.set(key, nextValue);
  }

  override setMany(entries: Iterable<[K, V]>): this {
    for (const [key, value] of entries) {
      this.set(key, value);
    }
    return this;
  }

  override deleteMany(keys: Iterable<K>): this {
    for (const key of keys) {
      this.delete(key);
    }
    return this;
  }

  override mergeInPlace(...others: MutableCollection<K, V>[]): this {
    for (const other of others) {
      for (const [key, value] of other.entries()) {
        this.set(key, value);
      }
    }
    return this;
  }

  /**
   * Move a key to the front (most recently used)
   */
  moveToFront(key: K): boolean {
    const node = this.nodeMap.get(key);
    if (!node || node === this.head) {
      return false;
    }

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    // Move to front
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    return true;
  }

  /**
   * Move a key to the back (least recently used)
   */
  moveToBack(key: K): boolean {
    const node = this.nodeMap.get(key);
    if (!node || node === this.tail) {
      return false;
    }

    // Remove from current position
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    // Move to back
    node.next = null;
    node.prev = this.tail;
    if (this.tail) {
      this.tail.next = node;
    }
    this.tail = node;

    return true;
  }

  /**
   * Move an existing key before another key
   */
  moveBefore(keyToMove: K, beforeKey: K): boolean {
    if (Object.is(keyToMove, beforeKey)) {
      return false;
    }
    const moving = this.nodeMap.get(keyToMove);
    const before = this.nodeMap.get(beforeKey);
    if (!moving || !before) {
      return false;
    }

    // Detach moving
    if (moving.prev) {
      moving.prev.next = moving.next;
    } else {
      this.head = moving.next;
    }
    if (moving.next) {
      moving.next.prev = moving.prev;
    } else {
      this.tail = moving.prev;
    }

    // Insert before target
    moving.next = before;
    moving.prev = before.prev;
    if (before.prev) {
      before.prev.next = moving;
    } else {
      this.head = moving;
    }
    before.prev = moving;
    return true;
  }

  /**
   * Move an existing key after another key
   */
  moveAfter(keyToMove: K, afterKey: K): boolean {
    if (Object.is(keyToMove, afterKey)) {
      return false;
    }
    const moving = this.nodeMap.get(keyToMove);
    const after = this.nodeMap.get(afterKey);
    if (!moving || !after) {
      return false;
    }

    // Detach moving
    if (moving.prev) {
      moving.prev.next = moving.next;
    } else {
      this.head = moving.next;
    }
    if (moving.next) {
      moving.next.prev = moving.prev;
    } else {
      this.tail = moving.prev;
    }

    // Insert after target
    moving.prev = after;
    moving.next = after.next;
    if (after.next) {
      after.next.prev = moving;
    } else {
      this.tail = moving;
    }
    after.next = moving;
    return true;
  }

  /**
   * Remove entry at index (0-based) and return it
   */
  removeAt(index: number): [K, V] | undefined {
    if (!Number.isFinite(index) || index < 0) {
      return undefined;
    }
    let i = 0;
    let current = this.head;
    while (current) {
      if (i === index) {
        const out: [K, V] = [current.key, current.value];
        this.delete(current.key);
        return out;
      }
      i++;
      current = current.next;
    }
    return undefined;
  }

  /**
   * Get entry at index (0-based)
   */
  entryAt(index: number): [K, V] | undefined {
    if (!Number.isFinite(index) || index < 0) {
      return undefined;
    }
    let i = 0;
    let current = this.head;
    while (current) {
      if (i === index) {
        return [current.key, current.value];
      }
      i++;
      current = current.next;
    }
    return undefined;
  }

  /**
   * Trim the map to at most maxSize entries, removing from the front
   */
  trimTo(maxSize: number): this {
    if (maxSize < 0) {
      return this;
    }
    while (this.size > maxSize) {
      this.shift();
    }
    return this;
  }

  /**
   * Get the first value (oldest)
   */
  getFirstValue(): V | undefined {
    return this.head?.value;
  }

  /**
   * Get the last value (newest)
   */
  getLastValue(): V | undefined {
    return this.tail?.value;
  }

  /**
   * Get the first key
   */
  getFirstKey(): K | undefined {
    return this.head?.key;
  }

  /**
   * Get the last key
   */
  getLastKey(): K | undefined {
    return this.tail?.key;
  }

  /**
   * Remove and return the first entry
   */
  shift(): [K, V] | undefined {
    if (!this.head) {
      return undefined;
    }

    const key = this.head.key;
    const value = this.head.value;
    this.delete(key);

    return [key, value];
  }

  /**
   * Remove and return the last entry
   */
  pop(): [K, V] | undefined {
    if (!this.tail) {
      return undefined;
    }

    const key = this.tail.key;
    const value = this.tail.value;
    this.delete(key);

    return [key, value];
  }

  /**
   * Add entry at the beginning
   */
  unshift(key: K, value: V): this {
    if (this.has(key)) {
      this.set(key, value);
      this.moveToFront(key);
    } else {
      const newNode = new OrderNode(key, value);

      if (this.head) {
        newNode.next = this.head;
        this.head.prev = newNode;
        this.head = newNode;
      } else {
        this.head = this.tail = newNode;
      }

      this.nodeMap.set(key, newNode);
      this.data.set(key, value);
    }

    return this;
  }

  /**
   * Insert before a specific key
   */
  insertBefore(beforeKey: K, key: K, value: V): boolean {
    const beforeNode = this.nodeMap.get(beforeKey);
    if (!beforeNode || this.has(key)) {
      return false;
    }

    const newNode = new OrderNode(key, value);

    newNode.next = beforeNode;
    newNode.prev = beforeNode.prev;

    if (beforeNode.prev) {
      beforeNode.prev.next = newNode;
    } else {
      this.head = newNode;
    }

    beforeNode.prev = newNode;

    this.nodeMap.set(key, newNode);
    this.data.set(key, value);

    return true;
  }

  /**
   * Insert after a specific key
   */
  insertAfter(afterKey: K, key: K, value: V): boolean {
    const afterNode = this.nodeMap.get(afterKey);
    if (!afterNode || this.has(key)) {
      return false;
    }

    const newNode = new OrderNode(key, value);

    newNode.prev = afterNode;
    newNode.next = afterNode.next;

    if (afterNode.next) {
      afterNode.next.prev = newNode;
    } else {
      this.tail = newNode;
    }

    afterNode.next = newNode;

    this.nodeMap.set(key, newNode);
    this.data.set(key, value);

    return true;
  }

  /**
   * Get position of a key (0-indexed)
   */
  indexOf(key: K): number {
    let index = 0;
    let current = this.head;

    while (current) {
      if (Object.is(current.key, key)) {
        return index;
      }
      current = current.next;
      index++;
    }

    return -1;
  }

  /**
   * Reorder based on comparator
   */
  reorder(compareFn: (a: [K, V], b: [K, V]) => number): this {
    const entries = [...this.entries()];
    entries.sort(compareFn);

    this.clear();
    for (const [key, value] of entries) {
      this.set(key, value);
    }

    return this;
  }

  /**
   * Iterate in order
   */
  override *entries(): IterableIterator<[K, V]> {
    let current = this.head;
    while (current) {
      yield [current.key, current.value];
      current = current.next;
    }
  }

  /**
   * Iterate keys in order
   */
  override *keys(): IterableIterator<K> {
    let current = this.head;
    while (current) {
      yield current.key;
      current = current.next;
    }
  }

  /**
   * Iterate values in order
   */
  override *values(): IterableIterator<V> {
    let current = this.head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }

  /**
   * Iterate in reverse order
   */
  *entriesReverse(): IterableIterator<[K, V]> {
    let current = this.tail;
    while (current) {
      yield [current.key, current.value];
      current = current.prev;
    }
  }

  /**
   * Create a new OrderedMap with the same entries
   */
  override clone(): OrderedMap<K, V> {
    return new OrderedMap(this.entries());
  }

  /**
   * Check consistency between map and linked list
   */
  isConsistent(): boolean {
    // Check size consistency
    let count = 0;
    let current = this.head;
    while (current) {
      count++;
      current = current.next;
    }

    if (count !== this.size || count !== this.nodeMap.size) {
      return false;
    }

    // Check all nodes are in maps
    current = this.head;
    while (current) {
      if (!this.nodeMap.has(current.key) || !this.data.has(current.key)) {
        return false;
      }
      current = current.next;
    }

    return true;
  }

  /**
   * Get string representation
   */
  override toString(): string {
    const entries = [...this.entries()].map(([k, v]) => `${String(k)}: ${String(v)}`).join(', ');
    return `OrderedMap(${this.size}) { ${entries} }`;
  }
}
