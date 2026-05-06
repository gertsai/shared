// SPDX-License-Identifier: Apache-2.0
import type { ActionDefinition } from '@gertsai/api-core/contracts';

// Module-private brand per ADR-009 I-7 (CWE-1321 protection — no global symbol-for surface).
const RPC_PROXY_BRAND = Symbol('rpc-proxy');

/**
 * Optional metadata bridged to the underlying transport on every call.
 *
 * Keep additive — new fields must remain optional so older transports
 * keep working unchanged.
 */
export interface RpcCallOptions {
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Generic RPC transport contract — single dispatch method.
 *
 * Concrete implementations (Moleculer broker.call, WebSocket RPC,
 * HTTP fetch) live OUTSIDE this package and supply their own runtime
 * binding via this interface.
 */
export interface RpcTransport {
  call<TInput, TOutput>(
    actionName: string,
    input: TInput,
    options?: RpcCallOptions,
  ): Promise<TOutput>;
}

/**
 * Maps a `Record<string, ActionDefinition<I, O>>` into a typed proxy where
 * each property becomes `(input: I, options?: RpcCallOptions) => Promise<O>`.
 */
export type RpcProxy<TActionMap extends Record<string, ActionDefinition<unknown, unknown>>> = {
  [K in keyof TActionMap]: TActionMap[K] extends ActionDefinition<infer I, infer O>
    ? (input: I, options?: RpcCallOptions) => Promise<O>
    : never;
};

const proxyCache = new WeakMap<object, unknown>();

/**
 * Build a read-only Proxy that dispatches typed action calls through `transport`.
 *
 * Returns the same proxy reference for the same `actions` object (WeakMap cache),
 * so callers may rebuild their map cheaply per request.
 *
 * Invariants (ADR-009):
 *  - I-14: unknown action name throws synchronously — no fail-open / namespace probing.
 *  - I-15: read-only surface — `set` and `deleteProperty` traps reject mutation.
 *  - I-7:  module-private brand symbol — `isRpcProxy` cannot be forged externally.
 */
export function createRpcProxy<
  TActionMap extends Record<string, ActionDefinition<unknown, unknown>>,
>(transport: RpcTransport, actions: TActionMap): RpcProxy<TActionMap> {
  const cached = proxyCache.get(actions);
  if (cached) return cached as RpcProxy<TActionMap>;

  const actionKeys = new Set(Object.keys(actions));

  const proxy = new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        if (typeof prop === 'symbol') {
          if (prop === RPC_PROXY_BRAND) return true;
          return undefined;
        }
        if (!actionKeys.has(prop)) {
          throw new Error(`Unknown RPC action: ${prop}`);
        }
        return (input: unknown, options?: RpcCallOptions) =>
          transport.call(prop, input, options);
      },
      set() {
        return false;
      },
      deleteProperty() {
        return false;
      },
    },
  ) as RpcProxy<TActionMap>;

  proxyCache.set(actions, proxy);
  return proxy;
}

/**
 * Type guard: `true` iff `value` was produced by `createRpcProxy` in this module.
 *
 * Uses a module-private `Symbol('rpc-proxy')` so external callers cannot
 * forge the brand (CWE-1321).
 */
export function isRpcProxy(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  return (value as Record<symbol, unknown>)[RPC_PROXY_BRAND] === true;
}
