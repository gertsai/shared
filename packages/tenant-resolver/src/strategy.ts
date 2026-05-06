// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal duck-typed HTTP request shape consumed by built-in HTTP-shaped
 * strategies (header / subdomain / path). Avoids coupling to any concrete
 * framework type so the same Strategy implementations work across Node
 * `http.IncomingMessage`, the WHATWG `Request`, Moleculer-web requests,
 * and arbitrary test fixtures.
 *
 * Header values follow Node's idiomatic shape: `string | string[] | undefined`,
 * with case-insensitive lookup expected by callers.
 */
export interface HttpRequestLike {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly url?: string;
  readonly method?: string;
}

/**
 * Result of a successful tenant resolution. `strategyName` preserves
 * provenance so audit logs / telemetry can record which strategy in a chain
 * actually resolved the tenant (per ADR-006 Decision B §1).
 */
export interface TenantResolution {
  readonly tenantId: string;
  readonly strategyName: string;
}

/**
 * Composable tenant-resolution strategy.
 *
 * `resolve` returns `null` on no-match (chainable, fail-open per strategy)
 * — the orchestrator (`ChainTenantResolver`) decides whether the absence of
 * any matching strategy should throw (`mode: 'strict'`, default per ADR-006
 * I-18) or propagate `null` (`mode: 'optional'`).
 *
 * Implementations MUST set a stable `name` so `TenantResolution.strategyName`
 * surfaces meaningful provenance.
 */
export interface TenantResolverStrategy<Source> {
  readonly name: string;
  resolve(source: Source): Promise<TenantResolution | null>;
}
