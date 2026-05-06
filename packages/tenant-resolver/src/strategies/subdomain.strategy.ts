// SPDX-License-Identifier: Apache-2.0
import type { HttpRequestLike, TenantResolution, TenantResolverStrategy } from '../strategy.js';
import { extractHostHeader } from './header-lookup.js';

const IPV4_LITERAL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const TENANT_SEGMENT = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export interface SubdomainStrategyOptions {
  readonly baseDomain: string;
  /**
   * Optional whitelist of fully-qualified host names that the strategy is
   * allowed to operate on. If provided, requests whose `Host` is not in
   * the list (case-insensitive) are rejected (`null`). Tightens the scope
   * beyond a generic suffix match to defend against host-spoofed attacks
   * (security P1-2).
   */
  readonly allowedHosts?: readonly string[];
}

/**
 * Extracts a tenant identifier from a subdomain segment of the request's
 * `Host` header. Example: `tenantA.gertsai.dev` → `{ tenantId: 'tenantA' }`.
 *
 * SECURITY (security P1-2):
 *   - Strict suffix match: `host` MUST end with `'.' + baseDomain` AND
 *     MUST NOT equal `baseDomain` (apex). Rejects e.g.
 *     `attacker.evil.gertsai.dev.attacker.com`.
 *   - IPv4 / IPv6 literals are rejected (cannot host a tenant subdomain).
 *   - The leading subdomain segment must match a strict label regex
 *     (alphanumeric + hyphens, RFC 1035-compatible) to reject path /
 *     punctuation injection attempts.
 *   - Multi-label subdomains (`alpha.beta.gertsai.dev`) collapse the
 *     left-most label as the tenant, ignoring intermediate labels — so
 *     `staging.tenantA.gertsai.dev` resolves to `staging`. Consumers that
 *     want a different policy should restrict via `allowedHosts`.
 */
export class SubdomainStrategy implements TenantResolverStrategy<HttpRequestLike> {
  readonly name = 'subdomain';
  private readonly baseDomain: string;
  private readonly suffix: string;
  private readonly allowedHosts: readonly string[] | undefined;

  constructor(options: SubdomainStrategyOptions) {
    if (!options.baseDomain || options.baseDomain.trim() === '') {
      throw new Error('SubdomainStrategy requires non-empty baseDomain');
    }
    this.baseDomain = options.baseDomain.toLowerCase();
    this.suffix = `.${this.baseDomain}`;
    this.allowedHosts = options.allowedHosts?.map((h) => h.toLowerCase());
  }

  async resolve(req: HttpRequestLike): Promise<TenantResolution | null> {
    const host = extractHostHeader(req);
    if (!host) return null;
    const normalised = host.toLowerCase();

    if (this.allowedHosts && !this.allowedHosts.includes(normalised)) {
      return null;
    }

    if (IPV4_LITERAL.test(normalised) || normalised.startsWith('[')) {
      return null;
    }

    if (normalised === this.baseDomain) return null;
    if (!normalised.endsWith(this.suffix)) return null;

    const head = normalised.slice(0, normalised.length - this.suffix.length);
    if (head === '') return null;

    const labels = head.split('.');
    const tenantLabel = labels[0];
    if (!tenantLabel || !TENANT_SEGMENT.test(tenantLabel)) {
      return null;
    }

    return { tenantId: tenantLabel, strategyName: this.name };
  }
}
