// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import { Session } from '@gertsai/session';
import type { AbstractDialog, SessionOpts } from '@gertsai/session';

const makeDialog = (): AbstractDialog => ({
  confirm: vi.fn().mockResolvedValue(true),
  alert: vi.fn(),
  error: vi.fn(),
});

export function makeSession(overrides: Partial<SessionOpts> = {}): Session {
  return new Session({
    operatorUuid: 'op-1',
    operatorType: 'web',
    tokenGetter: vi.fn().mockResolvedValue('tok'),
    dialog: makeDialog(),
    clientPlatform: 'web',
    clientVersion: '1.0.0',
    ...overrides,
  });
}
