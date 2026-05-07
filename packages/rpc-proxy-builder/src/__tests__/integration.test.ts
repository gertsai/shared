// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import type { ActionDefinition } from '@gertsai/api-core/contracts';
import { createRpcProxy, type RpcTransport, type RpcCallOptions } from '../proxy.js';

interface Account {
  readonly id: string;
  readonly balance: number;
}

function makeActions() {
  return {
    ping: {} as ActionDefinition<void, 'pong'>,
    getAccount: {} as ActionDefinition<{ id: string }, Account>,
    deposit: {} as ActionDefinition<{ id: string; amount: number }, Account>,
    fail: {} as ActionDefinition<void, never>,
  } satisfies Record<string, ActionDefinition<unknown, unknown>>;
}

class InMemoryTransport implements RpcTransport {
  readonly accounts = new Map<string, Account>([
    ['a-1', { id: 'a-1', balance: 100 }],
  ]);

  readonly seenOptions: Array<RpcCallOptions | undefined> = [];

  async call<TInput, TOutput>(
    actionName: string,
    input: TInput,
    options?: RpcCallOptions,
  ): Promise<TOutput> {
    this.seenOptions.push(options);

    switch (actionName) {
      case 'ping':
        return 'pong' as TOutput;
      case 'getAccount': {
        const { id } = input as { id: string };
        const acc = this.accounts.get(id);
        if (!acc) throw new Error(`account not found: ${id}`);
        return acc as TOutput;
      }
      case 'deposit': {
        const { id, amount } = input as { id: string; amount: number };
        const acc = this.accounts.get(id);
        if (!acc) throw new Error(`account not found: ${id}`);
        const next: Account = { id: acc.id, balance: acc.balance + amount };
        this.accounts.set(id, next);
        return next as TOutput;
      }
      case 'fail':
        throw new Error('boom');
      default:
        throw new Error(`unhandled: ${actionName}`);
    }
  }
}

describe('rpc-proxy-builder integration', () => {
  it('round-trips a synchronous mock transport implementation', async () => {
    const transport = new InMemoryTransport();
    const proxy = createRpcProxy(transport, makeActions());

    await expect(proxy.ping(undefined as unknown as void)).resolves.toBe('pong');
    await expect(proxy.getAccount({ id: 'a-1' })).resolves.toEqual({
      id: 'a-1',
      balance: 100,
    });
  });

  it('propagates async errors back to callers', async () => {
    const transport = new InMemoryTransport();
    const proxy = createRpcProxy(transport, makeActions());

    await expect(proxy.fail(undefined as unknown as void)).rejects.toThrow('boom');
    await expect(proxy.getAccount({ id: 'missing' })).rejects.toThrow(
      'account not found: missing',
    );
  });

  it('bridges RpcCallOptions through to the transport on each call', async () => {
    const transport = new InMemoryTransport();
    const proxy = createRpcProxy(transport, makeActions());

    await proxy.ping(undefined as unknown as void, { correlationId: 'cid-1' });
    await proxy.getAccount({ id: 'a-1' }, { timeoutMs: 1500, meta: { traceId: 't-1' } });

    expect(transport.seenOptions).toEqual([
      { correlationId: 'cid-1' },
      { timeoutMs: 1500, meta: { traceId: 't-1' } },
    ]);
  });

  it('routes multiple actions through the same proxy with mutating state', async () => {
    const transport = new InMemoryTransport();
    const proxy = createRpcProxy(transport, makeActions());

    const before = await proxy.getAccount({ id: 'a-1' });
    expect(before.balance).toBe(100);

    const after = await proxy.deposit({ id: 'a-1', amount: 50 });
    expect(after.balance).toBe(150);

    const reread = await proxy.getAccount({ id: 'a-1' });
    expect(reread.balance).toBe(150);
  });
});
