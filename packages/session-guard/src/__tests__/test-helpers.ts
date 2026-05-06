// SPDX-License-Identifier: Apache-2.0
import { Session } from '@gertsai/session';
import type {
  AbstractDialog,
  OperatorType,
  SessionOpts,
} from '@gertsai/session';

const noopDialog: AbstractDialog = {
  confirm: async () => true,
  alert: () => undefined,
  error: () => undefined,
};

export function makeSession(
  overrides: Partial<SessionOpts> = {},
): Session {
  return new Session({
    operatorUuid: 'op-1',
    operatorType: 'web' satisfies OperatorType,
    tokenGetter: async () => 'tok',
    dialog: noopDialog,
    clientPlatform: 'web',
    clientVersion: '1.0.0',
    ...overrides,
  });
}
