/**
 * Decodes a base64 string to a UTF-8 string.
 *
 * @param str - The base64 string to decode.
 * @returns The decoded UTF-8 string.
 *
 * @example
 * ```typescript
 * const decodedString = decodeBase64ToString('SGVsbG8gV29ybGQ=');
 * // decodedString is "Hello World"
 * ```
 */
export function decodeBase64ToString(str: string): string {
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Encodes a UTF-8 string to a base64 string.
 *
 * @param str - The UTF-8 string to encode.
 * @returns The encoded base64 string.
 *
 * @example
 * ```typescript
 * const encodedString = encodeStringToBase64('Hello World');
 * // encodedString is "SGVsbG8gV29ybGQ="
 * ```
 */
export function encodeStringToBase64(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}
