// SPDX-License-Identifier: Apache-2.0
//
// Sprint 3.9 ADR-009 Amendment 1.1: type-only contract for RPC action definitions.
// Consumed by `@gertsai/rpc-proxy-builder` (Tier 3) for type-safe Proxy generation.
// Pure type — no runtime, zero peer-dep cost.

/**
 * Type-only contract describing an RPC action's input and output shapes.
 *
 * Consumed by `@gertsai/rpc-proxy-builder.createRpcProxy<TActionMap>` to derive
 * `(input: I, options?: RpcCallOptions) => Promise<O>` method signatures from
 * a `Record<string, ActionDefinition<I, O>>` map.
 *
 * This is a structural type — concrete implementations (Moleculer action
 * schemas, custom RPC contracts) provide compatible objects via type
 * assertion or `satisfies`.
 *
 * @example
 * ```typescript
 * const actions = {
 *   getUser: { input: undefined as unknown as { id: string }, output: undefined as unknown as User },
 * } satisfies Record<string, ActionDefinition<unknown, unknown>>;
 * ```
 */
export interface ActionDefinition<TInput = unknown, TOutput = unknown> {
  readonly input?: TInput;
  readonly output?: TOutput;
}
