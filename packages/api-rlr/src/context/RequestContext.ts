/**
 * Request context for rate limiting
 * Provides request tracing and metadata storage
 */

import { getClientIp } from 'request-ip';

import type { IncomingRequest } from '../utils/types';

export interface RequestContextData {
  method: string;
  path: string;
  ip: string | null;
  normalizedPath?: string;
  bucket?: string;
  subject?: string;
  routeMatched?: boolean;
  limit?: number;
  timeFrame?: number;
  strategy?: string;
  remaining?: number;
  decision?: 'allowed' | 'blocked';
  error?: string;
}

export class RlrRequestContext {
  private data = new Map<string, unknown>();
  private readonly startTime: number;
  public requestId: string;

  constructor(
    public readonly request: IncomingRequest,
    startTime?: number,
  ) {
    this.startTime = startTime ?? Date.now();
    this.requestId = this.generateRequestId();
    this.initializeBasicData();
  }

  private generateRequestId(): string {
    return `rlr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private initializeBasicData(): void {
    this.data.set('method', this.request.method || 'GET');
    this.data.set('path', this.request.url || this.request.originalUrl || '');
    this.data.set('ip', getClientIp(this.request));
    this.data.set('headers', this.request.headers || {});
  }

  /**
   * Set a context value
   */
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  /**
   * Get a context value
   */
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Set multiple values at once
   */
  setMany(values: Record<string, unknown>): void {
    Object.entries(values).forEach(([key, value]) => {
      this.data.set(key, value);
    });
  }

  /**
   * Get duration since start
   */
  getDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Mark request as rate limited
   */
  markRateLimited(details: {
    limit: number;
    timeFrame: number;
    remaining: number;
    retryAfter?: number;
  }): void {
    this.setMany({
      decision: 'blocked',
      rateLimited: true,
      ...details,
    });
  }

  /**
   * Mark request as allowed
   */
  markAllowed(details: { limit: number; timeFrame: number; remaining: number }): void {
    this.setMany({
      decision: 'allowed',
      rateLimited: false,
      ...details,
    });
  }

  /**
   * Mark an error
   */
  markError(error: Error | string): void {
    this.set('error', error instanceof Error ? error.message : error);
    this.set('errorStack', error instanceof Error ? error.stack : undefined);
  }

  /**
   * Get context as JSON for logging
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      requestId: this.requestId,
      duration: this.getDuration(),
    };

    // Convert Map to plain object
    this.data.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Get a summary for quick logging
   */
  getSummary(): string {
    const method = this.get<string>('method');
    const path = this.get<string>('path');
    const decision = this.get<string>('decision');
    const duration = this.getDuration();

    return `[${this.requestId}] ${method} ${path} - ${decision || 'pending'} (${duration}ms)`;
  }

  /**
   * Create a child context for nested operations
   */
  createChild(prefix: string): RlrRequestContext {
    const child = new RlrRequestContext(this.request, this.startTime);
    child.requestId = `${this.requestId}_${prefix}`;

    // Copy parent data
    this.data.forEach((value, key) => {
      child.data.set(key, value);
    });

    return child;
  }
}
