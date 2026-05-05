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

  // ---------------- F-1: alias getters ----------------

  it('exposes $isUnsaved and $isOptimistic as aliases of $isMockup', () => {
    const o1 = new Order();
    expect(o1.$isUnsaved).toBe(true);
    expect(o1.$isOptimistic).toBe(true);

    o1.$markSaved();
    expect(o1.$isMockup).toBe(false);
    expect(o1.$isUnsaved).toBe(false);
    expect(o1.$isOptimistic).toBe(false);

    const o2 = new Order({ isMockup: false });
    expect(o2.$isUnsaved).toBe(false);
    expect(o2.$isOptimistic).toBe(false);
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

  // ---------------- F-3: $setMetadata boolean + per-key gating ----------------

  it('$setMetadata merges + emits "metadata-changed" + returns true', () => {
    const o = new Order();
    const handler = vi.fn();
    o.on('metadata-changed', handler);

    const result = o.$setMetadata({ source: 'mobile', version: 2 });
    expect(result).toBe(true);
    expect(o.$metadata).toEqual({ source: 'mobile', version: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0]![0] as {
      partial: Partial<OrderMeta>;
      metadata: OrderMeta;
    };
    expect(payload.partial).toEqual({ source: 'mobile', version: 2 });
    expect(payload.metadata).toBe(o.$metadata);
  });

  it('$setMetadata with identical values returns false and does not emit', () => {
    const o = new Order({ metadata: { source: 'web', version: 5 } });
    const handler = vi.fn();
    o.on('metadata-changed', handler);

    const result = o.$setMetadata({ source: 'web', version: 5 });
    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('$setMetadata(partial, false) bypasses equality check and always emits', () => {
    const o = new Order({ metadata: { source: 'web', version: 5 } });
    const handler = vi.fn();
    o.on('metadata-changed', handler);

    const result = o.$setMetadata({ source: 'web', version: 5 }, false);
    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('$setMetadata throws after $destroy', () => {
    const o = new Order();
    o.$destroy();
    expect(() => o.$setMetadata({ source: 'web' })).toThrow(/destroyed Entity/);
  });

  // ---------------- F-4: toJSONObject (override) ----------------

  it('toJSONObject returns the widened shape with metadata + __typename', () => {
    const o = new Order({
      uid: 'order-1',
      data: { total: 100, currency: 'EUR' },
      metadata: { source: 'web', version: 3 },
    });
    expect(o.toJSONObject()).toEqual({
      _uid: 'order-1',
      data: { total: 100, currency: 'EUR' },
      metadata: { source: 'web', version: 3 },
      __typename: 'Order',
    });
  });

  it('toJSON round-trips and preserves __typename', () => {
    const o = new Order({ uid: 'o-2', data: { total: 7, currency: 'USD' } });
    const restored = JSON.parse(o.toJSON()) as {
      _uid: string;
      data: OrderData;
      metadata: OrderMeta;
      __typename: string;
    };
    expect(restored._uid).toBe('o-2');
    expect(restored.__typename).toBe('Order');
    expect(restored.data).toEqual({ total: 7, currency: 'USD' });
    expect(restored.metadata).toEqual({ source: 'unknown', version: 1 });
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
