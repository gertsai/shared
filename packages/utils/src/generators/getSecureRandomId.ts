import { randomBytes } from 'node:crypto';

const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically secure random identifier using `crypto.randomBytes`.
 *
 * Suitable for security-significant identifiers (tokens, session IDs, invite codes,
 * CSRF tokens, password reset tokens). For non-security-significant random values
 * (UI keys, sampling), the cheaper `getRandomId` may be appropriate.
 *
 * Uses rejection sampling to avoid modulo bias when mapping 8-bit bytes onto
 * the 62-character base62 alphabet (256 % 62 = 8, so byte values 248..255 are
 * discarded).
 *
 * @param length - Length of the resulting base62 string. Default: 16. Minimum: 1.
 * @returns A base62-encoded random string of the requested length.
 * @throws {RangeError} If `length < 1`.
 *
 * @example
 *   const inviteToken = getSecureRandomId(32);
 *   // → 'aB3xK9pQ...32-char-base62-string'
 */
export function getSecureRandomId(length: number = 16): string {
  if (length < 1) {
    throw new RangeError(`getSecureRandomId: length must be >= 1, got ${length}`);
  }
  // Generate enough random bytes to map to base62 with rejection sampling.
  // Each base62 char uses log2(62) ≈ 5.95 bits → 1 byte per char is plenty.
  const bytes = randomBytes(length * 2); // 2x overhead for rejection sampling
  let result = '';
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const byteValue = bytes[i];
    if (byteValue === undefined) continue;
    // Rejection sampling — accept only values that map uniformly to 0..61.
    // 256 % 62 = 8 — reject the last 8 values (248..255) to avoid bias.
    if (byteValue >= 248) continue;
    result += BASE62_CHARS[byteValue % 62];
  }
  if (result.length < length) {
    // Extremely unlikely given 2x overhead, but defensive
    return result + getSecureRandomId(length - result.length);
  }
  return result;
}
