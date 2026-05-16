let _warnedGetRandomId = false;

function _warnGetRandomIdOnce(): void {
  if (_warnedGetRandomId) return;
  _warnedGetRandomId = true;
  // Don't pollute test runs
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return;
  // eslint-disable-next-line no-console
  console.warn(
    '[@gertsai/utils] getRandomId() uses Math.random() and is NOT cryptographically secure. ' +
      'For security-significant identifiers (tokens, session IDs, invite codes), use getSecureRandomId() instead.',
  );
}

/**
 * Generates a random string of a given length using `Math.random()`.
 *
 * @deprecated Use {@link getSecureRandomId} for any security-significant
 * identifier (tokens, session IDs, invite codes, CSRF tokens, password reset
 * tokens). `getRandomId` uses `Math.random()`, which is NOT cryptographically
 * secure (CWE-338) and is predictable to an attacker who has observed enough
 * output. This function is retained for non-security use cases (UI keys,
 * sampling, log correlation) and emits a one-time `console.warn` on first
 * call outside of test environments.
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
  _warnGetRandomIdOnce();

  let result = '';

  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return upper ? result.toUpperCase() : result;
};
