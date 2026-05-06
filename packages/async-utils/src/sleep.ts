// SPDX-License-Identifier: Apache-2.0

/**
 * Sleep for the specified milliseconds.
 *
 * @param ms — duration in milliseconds.
 * @returns Promise that resolves after `ms`.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
