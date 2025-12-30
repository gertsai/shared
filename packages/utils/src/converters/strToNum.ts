const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Converts a string to a number.
 * The string is treated as a base-62 number.
 *
 * @param str - The string to convert.
 * @returns The numeric representation of the string.
 *
 * @example
 * ```typescript
 * const num = strToNum('a');
 * // num is 36
 * ```
 */
export const strToNum = (str: string) => {
  let sum = 0;

  for (let i = 0; i < str.length; i++) {
    sum +=
      CHARS.indexOf(str[i] as string) *
      Math.pow(CHARS.length, str.length - i - 1);
  }

  return sum;
};
