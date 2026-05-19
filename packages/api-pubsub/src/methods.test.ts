// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

import { createPubsubServiceMethods } from './methods';

type FakeSubscription = {
  __name: string;
  exists: () => Promise<[boolean]>;
};

type FakeTopic = {
  exists: () => Promise<[boolean]>;
  subscription: (name: string) => FakeSubscription;
  createSubscription: (
    name: string,
    opts: unknown,
  ) => Promise<[FakeSubscription, unknown]>;
};

/**
 * Build a fake `PubSub` client + the spies we want to assert on.
 *
 * `topicExists` / `subscriptionExists` toggle the create-if-missing branches
 * of `getSubscription`.
 */
function makeFakePubSub({
  topicExists,
  subscriptionExists,
}: {
  topicExists: boolean;
  subscriptionExists: boolean;
}) {
  const subscription: FakeSubscription = {
    __name: 'sub-A',
    exists: vi.fn().mockResolvedValue([subscriptionExists]),
  };
  const createdSubscription: FakeSubscription = {
    __name: 'sub-A-created',
    exists: vi.fn().mockResolvedValue([true]),
  };
  const topic: FakeTopic = {
    exists: vi.fn().mockResolvedValue([topicExists]),
    subscription: vi.fn().mockReturnValue(subscription),
    createSubscription: vi
      .fn()
      .mockImplementation((_name: string, _opts: unknown) =>
        Promise.resolve([createdSubscription, {}]),
      ),
  };
  const pubSub = {
    topic: vi.fn().mockReturnValue(topic),
    createTopic: vi.fn().mockResolvedValue([{ name: 'topic-A' }]),
  };
  return { pubSub, topic, subscription, createdSubscription };
}

describe('createPubsubServiceMethods', () => {
  it('returns an empty record when config is undefined', () => {
    const empty = createPubsubServiceMethods(undefined);
    expect(Object.keys(empty)).toHaveLength(0);
  });

  it('returns getSubscription when config.pubSub is provided', () => {
    const { pubSub } = makeFakePubSub({ topicExists: true, subscriptionExists: true });
    const methods = createPubsubServiceMethods({
      pubSub: pubSub as unknown as Parameters<typeof createPubsubServiceMethods>[0]['pubSub'],
    } as Parameters<typeof createPubsubServiceMethods>[0]);
    expect(typeof methods.getSubscription).toBe('function');
  });

  it('getSubscription reuses an existing topic + subscription and memoizes on $subscriptions', async () => {
    const { pubSub, subscription } = makeFakePubSub({
      topicExists: true,
      subscriptionExists: true,
    });
    const methods = createPubsubServiceMethods({
      pubSub: pubSub as unknown as Parameters<typeof createPubsubServiceMethods>[0]['pubSub'],
    } as Parameters<typeof createPubsubServiceMethods>[0]);
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const getSubscription = methods.getSubscription as (
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      this: any,
      sub: string,
      topic: string,
    ) => Promise<unknown>;

    const svc = { $subscriptions: {} as Record<string, unknown>, logger: { info: vi.fn() } };
    const a = await getSubscription.call(svc, 'sub-A', 'topic-A');
    const b = await getSubscription.call(svc, 'sub-A', 'topic-A');

    expect(a).toBe(subscription);
    expect(b).toBe(subscription); // memoized via $subscriptions
    expect(pubSub.createTopic).not.toHaveBeenCalled();
  });

  it('getSubscription creates a missing topic + subscription', async () => {
    const { pubSub, topic, createdSubscription } = makeFakePubSub({
      topicExists: false,
      subscriptionExists: false,
    });
    const methods = createPubsubServiceMethods({
      pubSub: pubSub as unknown as Parameters<typeof createPubsubServiceMethods>[0]['pubSub'],
    } as Parameters<typeof createPubsubServiceMethods>[0]);
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const getSubscription = methods.getSubscription as (
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      this: any,
      sub: string,
      topic: string,
    ) => Promise<unknown>;

    const svc = { $subscriptions: {} as Record<string, unknown>, logger: { info: vi.fn() } };
    const resolved = await getSubscription.call(svc, 'sub-A', 'topic-A');

    expect(pubSub.createTopic).toHaveBeenCalledWith('topic-A');
    expect(topic.createSubscription).toHaveBeenCalledWith('sub-A', {
      enableMessageOrdering: true,
    });
    expect(resolved).toBe(createdSubscription);
    expect(svc.$subscriptions['sub-A']).toBe(createdSubscription);
  });
});
