/**
 * Subscription Manager for topic-based event subscriptions
 * Supports wildcards and pattern matching
 */

import type { Subscription, SubscriptionCallback } from './types.js';

// ============================================================================
// DoS protection (FR-W2, EVID-076 H-WS-2)
// ============================================================================

/**
 * Maximum number of `**` (multi-segment) wildcards permitted in a single
 * subscription pattern. Each extra `**` multiplies the recursion fan-out
 * exponentially, so we cap aggressively. Legitimate patterns rarely need
 * more than one or two — `'a.**.b'` or `'a.**.b.**.c'` are the realistic
 * upper bound. An adversarial server pushing topic strings against a
 * pattern with many `**`s would otherwise CPU-DoS the client.
 */
export const MAX_DOUBLE_STAR_SEGMENTS = 3;

/**
 * Maximum recursion depth inside {@link SubscriptionManager.wildcardMatch}.
 * Defence-in-depth: even with the `**` cap, deeply nested topics could in
 * theory produce a long recursion chain. 100 levels is far above any
 * legitimate topic hierarchy.
 */
const MAX_WILDCARD_RECURSION_DEPTH = 100;

/**
 * Maximum number of segments (dots + 1) in a single subscription pattern
 * or dispatched topic. Bounds the input to {@link wildcardMatch} so an
 * attacker cannot send `'a.a.a.…'` to multiply the per-call cost.
 */
const MAX_TOPIC_SEGMENTS = 64;

/**
 * Thrown when a {@link SubscriptionManager.subscribe} call passes an
 * adversarial pattern: too many `**` wildcards or too many segments.
 */
export class InvalidSubscriptionPatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubscriptionPatternError';
    Object.setPrototypeOf(this, InvalidSubscriptionPatternError.prototype);
  }
}

// ============================================================================
// Subscription Manager
// ============================================================================

/**
 * Manager for topic-based subscriptions with wildcard support
 *
 * @example
 * ```typescript
 * const manager = new SubscriptionManager();
 *
 * // Subscribe to specific topic
 * const id1 = manager.subscribe('user.created', (data) => {
 *   console.log('User created:', data);
 * });
 *
 * // Subscribe with wildcard
 * const id2 = manager.subscribe('user.*', (data) => {
 *   console.log('User event:', data);
 * });
 *
 * // Dispatch event
 * manager.dispatch('user.created', { id: '123', name: 'John' });
 *
 * // Unsubscribe
 * manager.unsubscribe(id1);
 * ```
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription<unknown>>();
  private idCounter = 0;

  /**
   * Subscribe to a topic
   * @param topic Topic pattern (supports * wildcard)
   * @param callback Callback function
   * @returns Subscription ID
   */
  subscribe<T = unknown>(
    topic: string,
    callback: SubscriptionCallback<T>
  ): string {
    // FR-W2 (H-WS-2): reject adversarial patterns at subscribe time —
    // catching the DoS at the entry point is cheaper than bounding the
    // recursion every dispatch.
    this.assertSafePattern(topic);

    const id = this.generateId();
    const isWildcard = topic.includes('*');

    const subscription: Subscription<T> = {
      id,
      topic,
      callback,
      isWildcard,
    };

    this.subscriptions.set(id, subscription as Subscription<unknown>);

    return id;
  }

  /**
   * Validate a subscription pattern against DoS-resistance caps. Throws
   * {@link InvalidSubscriptionPatternError} on violation. Called from
   * {@link subscribe} (FR-W2, EVID-076 H-WS-2).
   */
  private assertSafePattern(pattern: string): void {
    const parts = pattern.split('.');
    if (parts.length > MAX_TOPIC_SEGMENTS) {
      throw new InvalidSubscriptionPatternError(
        `Subscription pattern has ${parts.length} segments, exceeds limit ${MAX_TOPIC_SEGMENTS}`,
      );
    }
    let doubleStarCount = 0;
    for (const p of parts) {
      if (p === '**') doubleStarCount++;
    }
    if (doubleStarCount > MAX_DOUBLE_STAR_SEGMENTS) {
      throw new InvalidSubscriptionPatternError(
        `Subscription pattern has ${doubleStarCount} '**' segments, exceeds limit ${MAX_DOUBLE_STAR_SEGMENTS}`,
      );
    }
  }

  /**
   * Unsubscribe by ID
   * @param id Subscription ID
   * @returns True if subscription was found and removed
   */
  unsubscribe(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /**
   * Unsubscribe all handlers for a topic
   * @param topic Topic pattern
   * @returns Number of subscriptions removed
   */
  unsubscribeAll(topic: string): number {
    let count = 0;

    for (const [id, sub] of this.subscriptions) {
      if (sub.topic === topic) {
        this.subscriptions.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Dispatch an event to matching subscribers
   * @param topic Event topic
   * @param data Event data
   * @returns Number of callbacks invoked
   */
  dispatch<T = unknown>(topic: string, data: T): number {
    let count = 0;

    for (const sub of this.subscriptions.values()) {
      if (this.matchesTopic(sub.topic, topic, sub.isWildcard)) {
        // Count all invoked callbacks, even if they throw
        count++;
        try {
          sub.callback(data);
        } catch (error) {
          // Log but don't throw - continue dispatching to other subscribers
          console.error(
            `Error in subscription callback for topic '${topic}':`,
            error
          );
        }
      }
    }

    return count;
  }

  /**
   * Check if a topic pattern matches an event topic
   */
  private matchesTopic(
    pattern: string,
    topic: string,
    isWildcard: boolean
  ): boolean {
    // Exact match
    if (!isWildcard) {
      return pattern === topic;
    }

    // Wildcard matching
    return this.wildcardMatch(pattern, topic);
  }

  /**
   * Match a wildcard pattern against a topic
   * Supports:
   * - `*` matches any single segment
   * - `**` matches any number of segments
   *
   * FR-W2 (EVID-076 H-WS-2): bounded recursion depth to defend against
   * adversarial topic strings that could otherwise CPU-DoS the client.
   * Patterns are already validated at {@link subscribe} time against
   * `MAX_DOUBLE_STAR_SEGMENTS`; this is defence-in-depth for the dispatch
   * path where the topic comes from the (potentially untrusted) server.
   *
   * @param depth Current recursion depth (internal — callers pass 0).
   */
  private wildcardMatch(
    pattern: string,
    topic: string,
    depth = 0,
  ): boolean {
    if (depth > MAX_WILDCARD_RECURSION_DEPTH) {
      // Bail rather than throw — dispatch path treats a no-match as
      // "skip this subscriber" so an attacker cannot crash the client.
      return false;
    }

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    // Bound input size — a topic with hundreds of segments is itself
    // suspicious and shouldn't tax the matcher.
    if (
      patternParts.length > MAX_TOPIC_SEGMENTS ||
      topicParts.length > MAX_TOPIC_SEGMENTS
    ) {
      return false;
    }

    let pi = 0; // pattern index
    let ti = 0; // topic index

    while (pi < patternParts.length && ti < topicParts.length) {
      const pp = patternParts[pi];
      const tp = topicParts[ti];

      if (pp === undefined || tp === undefined) {
        break;
      }

      if (pp === '**') {
        // ** matches rest of topic
        if (pi === patternParts.length - 1) {
          return true;
        }
        // Try to match remaining pattern
        for (let i = ti; i <= topicParts.length; i++) {
          const remainingTopic = topicParts.slice(i).join('.');
          const remainingPattern = patternParts.slice(pi + 1).join('.');
          if (
            this.wildcardMatch(
              remainingPattern,
              remainingTopic,
              depth + 1,
            )
          ) {
            return true;
          }
        }
        return false;
      }

      if (pp === '*') {
        // * matches any single segment
        pi++;
        ti++;
        continue;
      }

      if (pp !== tp) {
        return false;
      }

      pi++;
      ti++;
    }

    // Check if both are exhausted
    return pi === patternParts.length && ti === topicParts.length;
  }

  /**
   * Get subscription by ID
   */
  get(id: string): Subscription<unknown> | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Check if subscription exists
   */
  has(id: string): boolean {
    return this.subscriptions.has(id);
  }

  /**
   * Get all subscriptions for a topic
   */
  getByTopic(topic: string): Subscription<unknown>[] {
    const result: Subscription<unknown>[] = [];

    for (const sub of this.subscriptions.values()) {
      if (sub.topic === topic) {
        result.push(sub);
      }
    }

    return result;
  }

  /**
   * Get all matching subscriptions for an event topic
   */
  getMatchingSubscriptions(topic: string): Subscription<unknown>[] {
    const result: Subscription<unknown>[] = [];

    for (const sub of this.subscriptions.values()) {
      if (this.matchesTopic(sub.topic, topic, sub.isWildcard)) {
        result.push(sub);
      }
    }

    return result;
  }

  /**
   * Get number of subscriptions
   */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all topics
   */
  getTopics(): string[] {
    const topics = new Set<string>();
    for (const sub of this.subscriptions.values()) {
      topics.add(sub.topic);
    }
    return Array.from(topics);
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Generate unique subscription ID
   */
  private generateId(): string {
    return `sub_${++this.idCounter}_${Date.now()}`;
  }
}
