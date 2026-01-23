/**
 * Security utilities for rate limiter
 * Prevents timing attacks and other security vulnerabilities
 */

import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison to prevent timing attacks
 * Uses crypto.timingSafeEqual under the hood
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
export function safeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // Handle empty strings
  if (bufA.length === 0 && bufB.length === 0) {
    return true;
  }

  // Compare byte lengths (not character lengths for unicode safety)
  if (bufA.length !== bufB.length) {
    // Still do comparison to prevent length-based timing leaks
    // Use a dummy comparison with fixed overhead
    if (bufA.length > 0) {
      const dummyB = Buffer.alloc(bufA.length);
      try {
        timingSafeEqual(bufA, dummyB);
      } catch {
        // Ignore - just for timing normalization
      }
    }
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time check if a value exists in a whitelist
 * Prevents timing-based enumeration of whitelist entries
 *
 * @param value - Value to check
 * @param whitelist - Array of allowed values
 * @returns true if value is in whitelist
 */
export function isWhitelisted(value: string, whitelist: readonly string[]): boolean {
  if (!whitelist || whitelist.length === 0) {
    return false;
  }

  // Always iterate through entire list to prevent timing leaks
  let found = false;
  for (const entry of whitelist) {
    if (safeStringEquals(value, entry)) {
      found = true;
      // Don't return early - complete the loop for constant time
    }
  }

  return found;
}
