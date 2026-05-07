// SPDX-License-Identifier: Apache-2.0

/**
 * Race an async action against a timeout.
 *
 * Per ADR-009 I-2 — throws standard `Error` (NOT `@gertsai/errors` TimeoutError) to keep
 * this package zero-dep. Consumers wrap with `@gertsai/errors` if needed.
 *
 * Per ADR-009 I-16 — uses internal AbortController + cleanup in `finally` so listeners
 * do not leak across many invocations (CWE-401).
 *
 * @param action — async function to invoke.
 * @param timeoutMs — timeout in milliseconds.
 * @param message — optional custom error message.
 * @returns Promise that resolves with action result or rejects with timeout `Error`.
 */
export async function withTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          const err = new Error(message ?? `Timeout after ${timeoutMs}ms`);
          err.name = 'AbortError';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
