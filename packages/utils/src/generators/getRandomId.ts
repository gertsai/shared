/**
 * Generates a random string of a given length.
 *
 * @param length - The length of the random string. Defaults to 10.
 * @param characters - The characters to use for generating the random string.
 * @param upper - Whether to convert the result to uppercase. Defaults to true.
 * @returns A random string.
 *
 * @example
 * ```typescript
 * const randomId = getRandomId(12);
 * // randomId is a 12-character random string
 *
 * const lowercaseId = getRandomId(12, 'abcdef', false);
 * // lowercaseId is a 12-character random string with only lowercase letters
 * ```
 */
export const getRandomId = (
  length = 10,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  upper = true,
) => {
  let result = '';

  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return upper ? result.toUpperCase() : result;
};
