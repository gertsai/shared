/**
 * Persistent Hash Array Mapped Trie (HAMT) implementation
 * Provides structural sharing for efficient immutable operations
 * Based on concepts from Clojure and immutable.js
 */

const SHIFT = 5; // 5 bits per level
const SIZE = 1 << SHIFT; // 32 branches per node
const MASK = SIZE - 1; // 0x1f

/**
 * Calculate hash code for any value
 */
function hash(value: unknown): number {
  if (value === null) {
    return 0x42108421;
  }
  if (value === undefined) {
    return 0x42108422;
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 0x42108423 : 0x42108424;
    case 'number':
      return hashNumber(value);
    case 'string':
      return hashString(value);
    case 'symbol':
      return hashString(value.toString());
    case 'object':
      return hashObject(value as Record<string, unknown>);
    default:
      return 0;
  }
}

function hashNumber(n: number): number {
  if (n !== n) {
    return 0x42108425; // NaN
  }
  return n | 0; // Convert to 32-bit integer
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return hash;
}

// Weak identity cache for objects to ensure stable hashes per identity
const objectHashCache: WeakMap<object, number> = new WeakMap();
let objectHashSeed = 0;

function hashObject(obj: Record<string, unknown>): number {
  const existing = objectHashCache.get(obj);
  if (existing !== undefined) {
    return existing;
  }
  // Assign a unique incremental id per object identity, then mix it
  // into a 32-bit hash space via hashNumber
  objectHashSeed = (objectHashSeed + 1) | 0;
  const h = hashNumber(objectHashSeed);
  objectHashCache.set(obj, h);
  return h;
}

/**
 * Internal node types for the HAMT structure
 */
abstract class Node<K, V> {
  abstract get(shift: number, hash: number, key: K): V | undefined;
  abstract set(shift: number, hash: number, key: K, value: V): Node<K, V>;
  abstract delete(shift: number, hash: number, key: K): Node<K, V> | null;
  abstract forEach(fn: (key: K, value: V) => void): void;
}

/**
 * Leaf node containing actual key-value pair
 */
class ValueNode<K, V> extends Node<K, V> {
  constructor(
    public hash: number,
    public key: K,
    public value: V,
  ) {
    super();
  }

  get(shift: number, hash: number, key: K): V | undefined {
    if (hash === this.hash && Object.is(key, this.key)) {
      return this.value;
    }
    return undefined;
  }

  set(shift: number, hash: number, key: K, value: V): Node<K, V> {
    if (hash === this.hash && Object.is(key, this.key)) {
      if (Object.is(value, this.value)) {
        return this;
      }
      return new ValueNode(hash, key, value);
    }

    // Hash collision - create a branch node
    return mergeTwoNodes(shift, this, new ValueNode(hash, key, value));
  }

  delete(shift: number, hash: number, key: K): Node<K, V> | null {
    if (hash === this.hash && Object.is(key, this.key)) {
      return null;
    }
    return this;
  }

  forEach(fn: (key: K, value: V) => void): void {
    fn(this.key, this.value);
  }
}

/**
 * Collision node for keys that share the same hash
 */
class CollisionNode<K, V> extends Node<K, V> {
  constructor(
    public hash: number,
    public entries: Array<ValueNode<K, V>>,
  ) {
    super();
  }

  get(shift: number, hash: number, key: K): V | undefined {
    if (hash !== this.hash) {
      return undefined;
    }
    for (const node of this.entries) {
      if (Object.is(node.key, key)) {
        return node.value;
      }
    }
    return undefined;
  }

  set(shift: number, hash: number, key: K, value: V): Node<K, V> {
    if (hash !== this.hash) {
      // Different hash: branch with this collision node and the new value node
      return mergeTwoNodes(shift, this, new ValueNode(hash, key, value));
    }

    let replaced = false;
    const newEntries = this.entries.map((node) => {
      if (Object.is(node.key, key)) {
        replaced = true;
        if (Object.is(node.value, value)) {
          return node;
        }
        return new ValueNode(hash, key, value);
      }
      return node;
    });

    if (!replaced) {
      newEntries.push(new ValueNode(hash, key, value));
    }

    return new CollisionNode(this.hash, newEntries);
  }

  delete(shift: number, hash: number, key: K): Node<K, V> | null {
    if (hash !== this.hash) {
      return this;
    }
    const newEntries = this.entries.filter((node) => !Object.is(node.key, key));

    if (newEntries.length === this.entries.length) {
      return this;
    }
    if (newEntries.length === 0) {
      return null;
    }
    if (newEntries.length === 1) {
      const [only] = newEntries;
      return only;
    }
    return new CollisionNode(this.hash, newEntries);
  }

  forEach(fn: (key: K, value: V) => void): void {
    for (const node of this.entries) {
      fn(node.key, node.value);
    }
  }
}

/**
 * Branch node with up to 32 children
 */
class BranchNode<K, V> extends Node<K, V> {
  constructor(
    public bitmap: number,
    public children: Array<Node<K, V>>,
  ) {
    super();
  }

  get(shift: number, hash: number, key: K): V | undefined {
    const bit = 1 << ((hash >>> shift) & MASK);
    if ((this.bitmap & bit) === 0) {
      return undefined;
    }

    const index = popcount(this.bitmap & (bit - 1));
    return this.children[index].get(shift + SHIFT, hash, key);
  }

  set(shift: number, hash: number, key: K, value: V): Node<K, V> {
    const bit = 1 << ((hash >>> shift) & MASK);
    const index = popcount(this.bitmap & (bit - 1));

    if ((this.bitmap & bit) === 0) {
      // Add new branch
      const newChildren = [...this.children];
      newChildren.splice(index, 0, new ValueNode(hash, key, value));
      return new BranchNode(this.bitmap | bit, newChildren);
    }

    // Update existing branch
    const child = this.children[index];
    const newChild = child.set(shift + SHIFT, hash, key, value);

    if (newChild === child) {
      return this;
    }

    const newChildren = [...this.children];
    newChildren[index] = newChild;
    return new BranchNode(this.bitmap, newChildren);
  }

  delete(shift: number, hash: number, key: K): Node<K, V> | null {
    const bit = 1 << ((hash >>> shift) & MASK);
    if ((this.bitmap & bit) === 0) {
      return this;
    }

    const index = popcount(this.bitmap & (bit - 1));
    const child = this.children[index];
    const newChild = child.delete(shift + SHIFT, hash, key);

    if (newChild === child) {
      return this;
    }

    if (newChild === null) {
      // Remove branch
      if (this.children.length === 1) {
        return null;
      }

      const newChildren = [...this.children];
      newChildren.splice(index, 1);
      return new BranchNode(this.bitmap & ~bit, newChildren);
    }

    const newChildren = [...this.children];
    newChildren[index] = newChild;
    return new BranchNode(this.bitmap, newChildren);
  }

  forEach(fn: (key: K, value: V) => void): void {
    for (const child of this.children) {
      child.forEach(fn);
    }
  }
}

/**
 * Merge two nodes when hash collision occurs
 */
function mergeTwoNodes<K, V>(
  shift: number,
  node1: Node<K, V>,
  node2: Node<K, V>,
): Node<K, V> {
  // Handle ValueNode + ValueNode
  if (node1 instanceof ValueNode && node2 instanceof ValueNode) {
    if (node1.hash === node2.hash) {
      // True hash collision: keep both entries
      // If keys are identical, prefer the second (upsert semantics)
      if (Object.is(node1.key, node2.key)) {
        return node2;
      }
      return new CollisionNode(node1.hash, [node1, node2]);
    }

    const bit1 = 1 << ((node1.hash >>> shift) & MASK);
    const bit2 = 1 << ((node2.hash >>> shift) & MASK);

    if (bit1 === bit2) {
      // Same branch - recurse deeper
      const child = mergeTwoNodes(shift + SHIFT, node1, node2);
      return new BranchNode(bit1, [child]);
    }

    // Different branches
    return bit1 < bit2
      ? new BranchNode(bit1 | bit2, [node1, node2])
      : new BranchNode(bit1 | bit2, [node2, node1]);
  }

  // Handle CollisionNode cases
  if (node1 instanceof CollisionNode && node2 instanceof ValueNode) {
    if (node1.hash === node2.hash) {
      const updated: Node<K, V> = node1.set(
        shift,
        node2.hash,
        node2.key,
        node2.value,
      );
      return updated;
    }
    const bit1 = 1 << ((node1.hash >>> shift) & MASK);
    const bit2 = 1 << ((node2.hash >>> shift) & MASK);
    return bit1 < bit2
      ? new BranchNode(bit1 | bit2, [node1, node2])
      : new BranchNode(bit1 | bit2, [node2, node1]);
  }

  if (node1 instanceof ValueNode && node2 instanceof CollisionNode) {
    const merged: Node<K, V> = mergeTwoNodes(shift, node2, node1);
    return merged;
  }

  if (node1 instanceof CollisionNode && node2 instanceof CollisionNode) {
    if (node1.hash === node2.hash) {
      // Merge entries by key, node2 takes precedence on duplicates
      const byKey = new Map<K, ValueNode<K, V>>();
      for (const n of node1.entries) {
        byKey.set(n.key, n);
      }
      for (const n of node2.entries) {
        byKey.set(n.key, n);
      }
      return new CollisionNode(node1.hash, [...byKey.values()]);
    }
    const bit1 = 1 << ((node1.hash >>> shift) & MASK);
    const bit2 = 1 << ((node2.hash >>> shift) & MASK);
    return bit1 < bit2
      ? new BranchNode(bit1 | bit2, [node1, node2])
      : new BranchNode(bit1 | bit2, [node2, node1]);
  }

  // BranchNode with anything: delegate to BranchNode.set for structure
  // Ensure node1 is BranchNode to simplify
  if (node1 instanceof BranchNode) {
    // We don't know the key/value to call set directly, but we can route via delete/set path
    // Instead, pick a stable key from node2 and set it.
    // Construct a temporary persistent structure by iterating node2
    let branch: Node<K, V> = node1;
    node2.forEach((k: K, v: V) => {
      branch = branch.set(shift, hash(k), k, v);
    });
    return branch;
  }

  // Fallback: reverse order
  return mergeTwoNodes(shift, node2, node1);
}

/**
 * Count set bits (Hamming weight)
 */
function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
}

/**
 * Persistent Map with structural sharing
 */
export class PersistentMap<K, V> {
  private root: Node<K, V> | null = null;
  private _size: number = 0;

  constructor(entries?: Iterable<[K, V]>) {
    if (entries) {
      let built = new PersistentMap<K, V>();
      for (const [key, value] of entries) {
        built = built.set(key, value);
      }
      this.root = built.root;
      this._size = built._size;
    }
  }

  get size(): number {
    return this._size;
  }

  get(key: K): V | undefined {
    if (this.root === null) {
      return undefined;
    }
    return this.root.get(0, hash(key), key);
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Returns a new PersistentMap with the key-value pair added
   * Shares structure with the original map
   */
  set(key: K, value: V): PersistentMap<K, V> {
    const h = hash(key);

    if (this.root === null) {
      const newMap = new PersistentMap<K, V>();
      newMap.root = new ValueNode(h, key, value);
      newMap._size = 1;
      return newMap;
    }

    const newRoot = this.root.set(0, h, key, value);
    if (newRoot === this.root) {
      return this;
    }

    const existed = this.get(key) !== undefined;
    const newMap = new PersistentMap<K, V>();
    newMap.root = newRoot;
    newMap._size = this._size + (existed ? 0 : 1);
    return newMap;
  }

  /**
   * Returns a new PersistentMap with the key removed
   * Shares structure with the original map
   */
  delete(key: K): PersistentMap<K, V> {
    if (this.root === null) {
      return this;
    }

    const h = hash(key);
    const newRoot = this.root.delete(0, h, key);

    if (newRoot === this.root) {
      return this;
    }

    const existed = this.get(key) !== undefined;
    const newMap = new PersistentMap<K, V>();
    newMap.root = newRoot;
    newMap._size = this._size - (existed ? 1 : 0);
    return newMap;
  }

  clear(): PersistentMap<K, V> {
    if (this.root === null) {
      return this;
    }
    const newMap = new PersistentMap<K, V>();
    newMap.root = null;
    newMap._size = 0;
    return newMap;
  }

  forEach<T = undefined>(
    callbackfn: (this: T, value: V, key: K, map: PersistentMap<K, V>) => void,
    thisArg?: T,
  ): void {
    if (this.root === null) {
      return;
    }

    const boundFn =
      thisArg !== undefined ? callbackfn.bind(thisArg) : callbackfn;
    this.root.forEach((key, value) =>
      (boundFn as (value: V, key: K, map: PersistentMap<K, V>) => void)(
        value,
        key,
        this,
      ),
    );
  }

  *entries(): IterableIterator<[K, V]> {
    const entries: Array<[K, V]> = [];
    this.forEach((value, key) => {
      entries.push([key, value]);
    });
    yield* entries;
  }

  *keys(): IterableIterator<K> {
    for (const [key] of this.entries()) {
      yield key;
    }
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return 'PersistentMap';
  }

  /**
   * Create a mutable copy for batch operations
   */
  asMutable(): Map<K, V> {
    return new Map(this.entries());
  }

  /**
   * Create a new PersistentMap from a regular Map
   */
  static fromMap<K, V>(map: Map<K, V>): PersistentMap<K, V> {
    return new PersistentMap(map);
  }
}
