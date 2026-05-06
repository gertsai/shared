// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import type { ActionDefinition } from '@gertsai/api-core/contracts';
import { createRpcProxy, isRpcProxy, type RpcTransport, type RpcCallOptions } from '../proxy.js';

interface User {
  readonly id: string;
  readonly name: string;
}

interface CreateUserInput {
  readonly name: string;
}

function makeActions() {
  return {
    getUser: {} as ActionDefinition<{ id: string }, User>,
    createUser: {} as ActionDefinition<CreateUserInput, User>,
    deleteUser: {} as ActionDefinition<{ id: string }, void>,
  } satisfies Record<string, ActionDefinition<unknown, unknown>>;
}

type MockedTransport = RpcTransport & { call: ReturnType<typeof vi.fn> };

function makeMockTransport(): MockedTransport {
  const fn = vi.fn(async (_a: string, _i: unknown, _o?: RpcCallOptions) => undefined);
  return { call: fn } as unknown as MockedTransport;
}

describe('createRpcProxy', () => {
  it('builds a proxy from an action map', () => {
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions());

    expect(typeof proxy).toBe('object');
    expect(typeof proxy.getUser).toBe('function');
    expect(typeof proxy.createUser).toBe('function');
    expect(typeof proxy.deleteUser).toBe('function');
  });

  it('type-narrows input/output per ActionDefinition', () => {
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions());

    expectTypeOf(proxy.getUser).parameters.toEqualTypeOf<
      [{ id: string }, RpcCallOptions?]
    >();
    expectTypeOf(proxy.getUser).returns.resolves.toEqualTypeOf<User>();

    expectTypeOf(proxy.createUser).parameters.toEqualTypeOf<
      [CreateUserInput, RpcCallOptions?]
    >();
    expectTypeOf(proxy.deleteUser).returns.resolves.toEqualTypeOf<void>();
  });

  it('dispatches calls through transport with action name + input', async () => {
    const transport = makeMockTransport();
    transport.call.mockResolvedValueOnce({ id: 'u-1', name: 'Ada' });
    const proxy = createRpcProxy(transport, makeActions());

    const result = await proxy.getUser({ id: 'u-1' });

    expect(transport.call).toHaveBeenCalledTimes(1);
    expect(transport.call).toHaveBeenCalledWith('getUser', { id: 'u-1' }, undefined);
    expect(result).toEqual({ id: 'u-1', name: 'Ada' });
  });

  it('propagates RpcCallOptions to the transport', async () => {
    const transport = makeMockTransport();
    transport.call.mockResolvedValueOnce({ id: 'u-2', name: 'Linus' });
    const proxy = createRpcProxy(transport, makeActions());

    const opts: RpcCallOptions = {
      timeoutMs: 5000,
      correlationId: 'cid-42',
      meta: { tenantId: 't-1' },
    };
    await proxy.getUser({ id: 'u-2' }, opts);

    expect(transport.call).toHaveBeenCalledWith('getUser', { id: 'u-2' }, opts);
  });

  it('returns the same proxy reference for the same action map (idempotent cache)', () => {
    const transport = makeMockTransport();
    const sharedActions = makeActions();
    const a = createRpcProxy(transport, sharedActions);
    const b = createRpcProxy(transport, sharedActions);

    expect(a).toBe(b);
  });

  it('isRpcProxy returns true only for proxies created by this module', () => {
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions());

    expect(isRpcProxy(proxy)).toBe(true);
    expect(isRpcProxy({})).toBe(false);
    expect(isRpcProxy(null)).toBe(false);
    expect(isRpcProxy(undefined)).toBe(false);
    expect(isRpcProxy('rpc-proxy')).toBe(false);
    // Forgery attempt with a foreign Symbol.for must NOT pass.
    const fake = { [Symbol.for('rpc-proxy')]: true };
    expect(isRpcProxy(fake)).toBe(false);
  });

  it('blocks Reflect.set / property assignment (I-15)', () => {
    'use strict';
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions()) as Record<string, unknown>;

    // Reflect.set returns false when the trap rejects the mutation.
    expect(Reflect.set(proxy, 'injected', () => 'evil')).toBe(false);

    // Strict mode: direct assignment throws TypeError when set trap returns false.
    expect(() => {
      proxy.injected = () => 'evil';
    }).toThrow(TypeError);
  });

  it('throws for unknown string actions (I-14, no fail-open)', () => {
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions()) as Record<string, unknown>;

    expect(() => proxy.unknownAction).toThrow('Unknown RPC action: unknownAction');
    expect(() => proxy.__proto__).toThrow(/Unknown RPC action/);
  });

  it('blocks delete (I-15)', () => {
    'use strict';
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions()) as Record<string, unknown>;

    expect(Reflect.deleteProperty(proxy, 'getUser')).toBe(false);
    expect(() => {
      delete proxy.getUser;
    }).toThrow(TypeError);
  });

  it('returns undefined for symbol-keyed access (e.g., Symbol.iterator)', () => {
    const transport = makeMockTransport();
    const proxy = createRpcProxy(transport, makeActions()) as object;

    expect((proxy as { [Symbol.iterator]?: unknown })[Symbol.iterator]).toBeUndefined();
    expect((proxy as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator]).toBeUndefined();
    expect((proxy as { [Symbol.toPrimitive]?: unknown })[Symbol.toPrimitive]).toBeUndefined();
  });
});
