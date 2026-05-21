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

/**
 * Two-level identity cache keyed first on `actions`, then on `transport`.
 *
 * Wave 26 (EVID-080 H3): the previous shape `WeakMap<actions, proxy>` ignored
 * transport identity — `createRpcProxy(transportA, sharedActions)` followed by
 * `createRpcProxy(transportB, sharedActions)` returned the proxy bound to
 * `transportA` for both calls, silently dispatching cross-transport. The
 * nested shape preserves the original "same `(actions, transport)` → same
 * proxy" identity guarantee while keeping per-transport proxies distinct.
 *
 * Both keys must remain weakly held — `transport` is typed as `object` (it is
 * `RpcTransport`, which is an interface and so structurally an object), and
 * `actions` is a `Record<string, ActionDefinition>` (also an object). WeakMap
 * requires keys to be objects/symbols, so we cast on `set`/`get`.
 */
const proxyCache = new WeakMap<
  object,
  WeakMap<RpcTransport, unknown>
>();

/**
 * Build a read-only Proxy that dispatches typed action calls through `transport`.
 *
 * Returns the same proxy reference for the same `(actions, transport)` pair
 * (nested WeakMap cache per EVID-080 H3), so callers may rebuild their map
 * cheaply per request. Distinct transports always yield distinct proxies even
 * when sharing the same `actions` object.
 *
 * Invariants (ADR-009):
 *  - I-14: unknown action name throws synchronously — no fail-open / namespace probing.
 *  - I-15: read-only surface — `set` and `deleteProperty` traps reject mutation.
 *  - I-7:  module-private brand symbol — `isRpcProxy` cannot be forged externally.
 */
export function createRpcProxy<
  TActionMap extends Record<string, ActionDefinition<unknown, unknown>>,
>(transport: RpcTransport, actions: TActionMap): RpcProxy<TActionMap> {
  let perTransport = proxyCache.get(actions);
  if (perTransport !== undefined) {
    const cached = perTransport.get(transport);
    if (cached !== undefined) return cached as RpcProxy<TActionMap>;
  }

  const actionKeys = new Set(Object.keys(actions));

  const proxy = new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        if (typeof prop === 'symbol') {
          if (prop === RPC_PROXY_BRAND) return true;
          return undefined;
        }
        // Allow Promise-unwrap detection to treat this proxy as a non-thenable.
        // Without this, `await Promise.resolve(proxy)` would call the get trap
        // for 'then', throw "Unknown RPC action: then", and reject the promise.
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
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
      has(_target, prop) {
        return typeof prop === 'string' && Object.prototype.hasOwnProperty.call(actions, prop);
      },
      ownKeys(_target) {
        return Object.keys(actions);
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop === 'string' && prop in actions) {
          return { enumerable: true, configurable: true, writable: false, value: undefined };
        }
        return undefined;
      },
    },
  ) as RpcProxy<TActionMap>;

  if (perTransport === undefined) {
    perTransport = new WeakMap<RpcTransport, unknown>();
    proxyCache.set(actions, perTransport);
  }
  perTransport.set(transport, proxy);
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
