/**
 * Vitest Setup - Mock typia for tests
 *
 * Typia requires a TypeScript transform that vitest doesn't support well.
 * We mock it to allow tests to run.
 */

import { vi } from 'vitest';

// Mock typia globally before any modules load
vi.mock('typia', () => {
  const mockValidator = () => ({ success: true, data: undefined });

  return {
    default: {
      createValidate: () => mockValidator,
      createValidateEquals: () => mockValidator,
      createIs: () => () => true,
      createAssert: () => (val: unknown) => val,
    },
    createValidate: () => mockValidator,
    createValidateEquals: () => mockValidator,
    createIs: () => () => true,
    createAssert: () => (val: unknown) => val,
  };
});
