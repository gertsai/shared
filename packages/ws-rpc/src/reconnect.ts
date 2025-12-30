/**
 * Reconnection Strategy with exponential backoff
 * Based on patterns from Orchestra WebSocketManager
 */

import type { ReconnectOptions } from './types.js';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<ReconnectOptions> = {
  enabled: true,
  maxAttempts: 5,
  delay: 1000,
  maxDelay: 30000,
  factor: 2,
  jitter: true,
};

// ============================================================================
// Reconnect Strategy
// ============================================================================

/**
 * Reconnection strategy with exponential backoff
 *
 * @example
 * ```typescript
 * const strategy = new ReconnectStrategy({ maxAttempts: 5 });
 *
 * while (strategy.shouldReconnect()) {
 *   const delay = strategy.getDelay();
 *   await sleep(delay);
 *   try {
 *     await connect();
 *     strategy.reset();
 *     break;
 *   } catch (error) {
 *     strategy.recordAttempt();
 *   }
 * }
 * ```
 */
export class ReconnectStrategy {
  private readonly enabled: boolean;
  private readonly maxAttempts: number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly factor: number;
  private readonly jitter: boolean;

  private attempts = 0;
  private lastAttemptTime = 0;

  constructor(options: ReconnectOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    this.enabled = opts.enabled;
    this.maxAttempts = opts.maxAttempts;
    this.initialDelay = opts.delay;
    this.maxDelay = opts.maxDelay;
    this.factor = opts.factor;
    this.jitter = opts.jitter;
  }

  /**
   * Check if should attempt reconnection
   */
  shouldReconnect(): boolean {
    if (!this.enabled) {
      return false;
    }

    return this.attempts < this.maxAttempts;
  }

  /**
   * Get delay for next reconnection attempt
   * Uses exponential backoff with optional jitter
   */
  getDelay(): number {
    // Exponential backoff: delay * factor^attempts
    let delay = this.initialDelay * Math.pow(this.factor, this.attempts);

    // Cap at max delay
    delay = Math.min(delay, this.maxDelay);

    // Add jitter (±25%)
    if (this.jitter) {
      const jitterRange = delay * 0.25;
      delay = delay - jitterRange + Math.random() * jitterRange * 2;
    }

    return Math.floor(delay);
  }

  /**
   * Record a reconnection attempt
   */
  recordAttempt(): void {
    this.attempts++;
    this.lastAttemptTime = Date.now();
  }

  /**
   * Reset the strategy (call after successful connection)
   */
  reset(): void {
    this.attempts = 0;
    this.lastAttemptTime = 0;
  }

  /**
   * Get current attempt number
   */
  getAttempts(): number {
    return this.attempts;
  }

  /**
   * Get max attempts
   */
  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  /**
   * Get time since last attempt
   */
  getTimeSinceLastAttempt(): number {
    if (this.lastAttemptTime === 0) {
      return 0;
    }
    return Date.now() - this.lastAttemptTime;
  }

  /**
   * Check if reconnection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(): number {
    return Math.max(0, this.maxAttempts - this.attempts);
  }
}
