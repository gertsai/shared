// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { stopPubsubSubscriptions } from './lifecycle';
import type { PubsubAwareService } from './lifecycle';

describe('stopPubsubSubscriptions', () => {
  it('is a no-op when service has no $subscriptions', async () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = {} as PubsubAwareService;
    await expect(stopPubsubSubscriptions(svc)).resolves.toBeUndefined();
  });

  it('drops every entry from service.$subscriptions (EVID-067 §Doctor Strange #5 closure)', async () => {
    const subA = { close: () => Promise.resolve() };
    const subB = { close: () => Promise.resolve() };
    const svc = {
      $subscriptions: { 'sub-A': subA, 'sub-B': subB },
    } as unknown as PubsubAwareService;

    await stopPubsubSubscriptions(svc);

    expect(Object.keys(svc.$subscriptions)).toHaveLength(0);
  });

  it('tolerates falsy subscription entries without throwing', async () => {
    const svc = {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      $subscriptions: { 'sub-A': null as any, 'sub-B': undefined as any },
    } as unknown as PubsubAwareService;

    await expect(stopPubsubSubscriptions(svc)).resolves.toBeUndefined();
  });
});
