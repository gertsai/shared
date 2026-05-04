/**
 * Truncates a string to a specified length and appends a delimiter.
 *
 * @param str - The string to truncate.
 * @param options - An object with `length` and `delimiter` properties.
 * @returns The truncated string.
 *
 * @example
 * ```typescript
 * const truncatedString = limitString('hello world', { length: 8, delimiter: '...' });
 * // truncatedString is "hello..."
 * ```
 */
export const limitString = (
  str: string,
  { length = 30, delimiter = '' }: { length?: number; delimiter?: string } = {},
) => {
  if (!str) {
    return str;
  }
  if (str.length <= length) {
    return str;
  }

  delimiter = delimiter || '...';
  return str.slice(0, length - delimiter.length) + delimiter;
};
