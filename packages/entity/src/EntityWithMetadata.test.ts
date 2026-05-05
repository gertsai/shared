// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { EntityWithMetadata } from './EntityWithMetadata';
import type { EntityWithMetadataOpts, WithTypename } from './types';

interface OrderData {
  total: number;
  currency: string;
}

interface OrderMeta {
  source: string;
  version: number;
}

class Order extends EntityWithMetadata<OrderData, OrderMeta, 'Order'> {
  readonly __typename = 'Order' as const;
  override $defaultData(): OrderData {
    return { total: 0, currency: 'USD' };
  }
  override $defaultMetadata(): OrderMeta {
    return { source: 'unknown', version: 1 };
  }
  constructor(opts: EntityWithMetadataOpts<OrderData, OrderMeta> = {}) {
    super(opts);
  }
}

describe('EntityWithMetadata', () => {
  it('defaults $isMockup to true and $isStaled to false', () => {
    const o = new Order();
    expect(o.$isMockup).toBe(true);
    expect(o.$isStaled).toBe(false);
  });

  it('respects opts.isMockup=false when provided', () => {
    const o = new Order({ isMockup: false });
    expect(o.$isMockup).toBe(false);
  });

  it('merges $defaultMetadata with opts.metadata', () => {
    const o = new Order({ metadata: { source: 'web' } });
    expect(o.$metadata).toEqual({ source: 'web', version: 1 });
  });

  it('$markSaved transitions isMockup true→false and emits "saved"', () => {
    const o = new Order();
    const handler = vi.fn();
    o.on('saved', handler);

    o.$markSaved();
    expect(o.$isMockup).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$markStaled emits "staled" once (idempotent)', () => {
    const o = new Order();
    const handler = vi.fn();
    o.on('staled', handler);

    o.$markStaled();
    o.$markStaled();
    expect(o.$isStaled).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$markFresh emits "refreshed" only when previously staled', () => {
    const o = new Order();
    const handler = vi.fn();
    o.on('refreshed', handler);

    o.$markFresh(); // no-op
    expect(handler).not.toHaveBeenCalled();

    o.$markStaled();
    o.$markFresh();
    expect(o.$isStaled).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$setMetadata merges + emits "metadata-changed"', () => {
    const o = new Order();
    const handler = vi.fn();
    o.on('metadata-changed', handler);

    o.$setMetadata({ source: 'mobile', version: 2 });
    expect(o.$metadata).toEqual({ source: 'mobile', version: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0] as {
      partial: Partial<OrderMeta>;
      metadata: OrderMeta;
    };
    expect(payload.partial).toEqual({ source: 'mobile', version: 2 });
    expect(payload.metadata).toBe(o.$metadata);
  });

  it('$setMetadata throws after $destroy', () => {
    const o = new Order();
    o.$destroy();
    expect(() => o.$setMetadata({ source: 'web' })).toThrow(/destroyed Entity/);
  });

  it('exposes a typed __typename discriminator', () => {
    const o = new Order();
    expect(o.__typename).toBe('Order');

    // type-level: Order satisfies WithTypename<OrderData, 'Order'>
    const _typeCheck: WithTypename<OrderData, 'Order'> = {
      __typename: 'Order',
      total: 0,
      currency: 'USD',
    };
    expect(_typeCheck.__typename).toBe('Order');
  });
});
