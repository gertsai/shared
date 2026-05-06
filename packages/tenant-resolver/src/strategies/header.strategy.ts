// SPDX-License-Identifier: Apache-2.0
import type { HttpRequestLike, TenantResolution, TenantResolverStrategy } from '../strategy.js';
import { lookupHeader } from './header-lookup.js';

export interface HeaderStrategyOptions {
  readonly headerName: string;
  /**
   * MUST be `true` (per ADR-006 I-15). Forces explicit acknowledgement
   * that a trusted reverse proxy strips and re-sets the header — without
   * this the tenant header is trivially spoofable by any client.
   *
   * Constructor throws `Error('HeaderStrategy requires trustProxy: true ...')`
   * when not explicitly `true`.
   */
  readonly trustProxy: boolean;
}

/**
 * Reads a tenant identifier from a HTTP request header.
 *
 * SECURITY (ADR-006 I-15): incoming HTTP headers are user-controllable.
 * A `X-Tenant-ID` header is only trustworthy if a trusted reverse proxy
 * (nginx, Envoy, ALB, Cloud Run ingress, etc.) strips any inbound
 * `X-Tenant-ID` and re-sets it from authenticated context. Construction
 * throws unless `trustProxy: true` is opted in — fail-closed default.
 */
export class HeaderStrategy implements TenantResolverStrategy<HttpRequestLike> {
  readonly name = 'header';
  private readonly headerName: string;

  constructor(options: HeaderStrategyOptions) {
    if (options.trustProxy !== true) {
      throw new Error(
        'HeaderStrategy requires trustProxy: true — header MUST be set/stripped by a trusted reverse proxy. See SECURITY section in README.',
      );
    }
    if (!options.headerName || options.headerName.trim() === '') {
      throw new Error('HeaderStrategy requires non-empty headerName');
    }
    this.headerName = options.headerName;
  }

  async resolve(req: HttpRequestLike): Promise<TenantResolution | null> {
    const raw = lookupHeader(req.headers, this.headerName);
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    return { tenantId: trimmed, strategyName: this.name };
  }
}
