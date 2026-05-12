import { validations } from '../utils/validations';

/**
 * Service responsible for generating Redis keys for rate limiting
 */
export class KeyGenerator {
  constructor(private readonly prefix: string = 'rlr:') {}

  /**
   * Generates a sliding window key for an IP address
   *
   * @param ip - The client's IP address
   * @returns The Redis key for sliding window rate limiting
   * @throws If IP address is invalid
   */
  generateSWKey(ip: string): string {
    validations.ip(ip);
    return `${this.prefix}sw:${ip}`;
  }

  /**
   * Generates a bucket key for rate limiting
   *
   * @param subject - The rate limit subject (IP, API key, user ID, etc.)
   * @param bucketId - The bucket identifier (e.g., 'get:/api/users')
   * @returns The Redis key for the bucket
   */
  generateBucketKey(subject: string, bucketId: string): string {
    if (!subject) {
      throw new Error('Subject is required for bucket key generation');
    }

    if (!bucketId) {
      throw new Error('Bucket ID is required for bucket key generation');
    }

    // Sanitize the subject and bucket ID to prevent Redis key issues
    const sanitizedSubject = this.sanitize(subject);
    const sanitizedBucket = this.sanitize(bucketId);

    return `${this.prefix}bucket:${sanitizedSubject}:${sanitizedBucket}`;
  }

  /**
   * Generates a GCRA key for rate limiting
   *
   * @param subject - The rate limit subject
   * @param bucketId - The bucket identifier
   * @returns The Redis key for GCRA rate limiting
   */
  generateGCRAKey(subject: string, bucketId: string): string {
    const sanitizedSubject = this.sanitize(subject);
    const sanitizedBucket = this.sanitize(bucketId);

    return `${this.prefix}gcra:${sanitizedSubject}:${sanitizedBucket}`;
  }

  /**
   * Generates a temporary key for health checks or testing
   *
   * @param suffix - Optional suffix for the key
   * @returns The Redis key for temporary operations
   */
  generateTempKey(suffix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const keySuffix = suffix ? `:${this.sanitize(suffix)}` : '';

    return `${this.prefix}temp:${timestamp}:${random}${keySuffix}`;
  }

  /**
   * Parses a Redis key to extract its components
   *
   * @param key - The Redis key to parse
   * @returns Object with key components or null if invalid format
   */
  parseKey(key: string): {
    type: 'sw' | 'bucket' | 'gcra' | 'temp' | 'unknown';
    subject?: string;
    bucketId?: string;
  } | null {
    if (!key.startsWith(this.prefix)) {
      return null;
    }

    const withoutPrefix = key.substring(this.prefix.length);
    const parts = withoutPrefix.split(':');

    if (parts.length === 0) {
      return null;
    }

    const type = parts[0];

    switch (type) {
      case 'sw':
        return {
          type: 'sw',
          ...(parts[1] !== undefined && { subject: parts[1] }),
        };

      case 'bucket':
      case 'gcra':
        return {
          type: type as 'bucket' | 'gcra',
          ...(parts[1] !== undefined && { subject: parts[1] }),
          bucketId: parts.slice(2).join(':'),
        };

      case 'temp':
        return { type: 'temp' };

      default:
        return { type: 'unknown' };
    }
  }

  /**
   * Validates if a key belongs to this rate limiter instance
   *
   * @param key - The Redis key to validate
   * @returns True if the key belongs to this instance
   */
  isOwnKey(key: string): boolean {
    return key.startsWith(this.prefix);
  }

  /**
   * Sanitizes a string to be safe for use in Redis keys
   *
   * @param value - The value to sanitize
   * @returns Sanitized string safe for Redis keys
   */
  private sanitize(value: string): string {
    // Replace spaces and special characters that might cause issues
    return value
      .replace(/\s+/g, '_')
      .replace(/[{}()[\]\\]/g, '-')
      .replace(/:/g, '.')
      .substring(0, 200); // Limit key component length
  }

  /**
   * Gets all key patterns used by this rate limiter
   * Useful for cleanup or monitoring
   *
   * @returns Array of Redis key patterns
   */
  getKeyPatterns(): string[] {
    return [
      `${this.prefix}sw:*`,
      `${this.prefix}bucket:*`,
      `${this.prefix}gcra:*`,
      `${this.prefix}temp:*`,
    ];
  }
}
