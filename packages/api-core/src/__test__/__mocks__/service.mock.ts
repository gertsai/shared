import { vi } from 'vitest';
import type { Service } from 'moleculer';

// @ts-ignore
export const moleculerServiceMock: Service = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
};
