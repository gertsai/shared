/**
 * ABAC Context Builder for gerts.ai
 *
 * Utilities for building ABAC context from HTTP requests.
 * Extracts IP address, geo-location, and other attributes.
 *
 * SEC-006: Secure IP and Geo extraction with trusted proxy validation.
 */

import type { ABACContext } from './types.js';
import { CLEARANCE_LEVELS, RESOURCE_STATUS, BLOCKED_COUNTRIES_OFAC } from './types.js';
import { isTrustedProxy, isCloudflareIp, DEFAULT_TRUSTED_PROXIES } from './cloudflare-ips.js';

// Re-export trusted proxy utilities
export { isTrustedProxy, isCloudflareIp, DEFAULT_TRUSTED_PROXIES } from './cloudflare-ips.js';

// Re-export types for convenience
export type { ClearanceLevel, ResourceStatus } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * HTTP request-like object for extracting ABAC context.
 */
export interface ABACRequestInfo {
  /** Client IP address (from X-Forwarded-For or socket) */
  ip?: string;
  /** Request headers */
  headers?: {
    'x-forwarded-for'?: string;
    'cf-ipcountry'?: string;
    'x-country-code'?: string;
    'x-real-ip'?: string;
    [key: string]: string | undefined;
  };
  /** User attributes from session/token */
  user?: {
    clearance?: number;
    tier?: string;
    plan?: string;
  };
}

/**
 * Resource information for ABAC context.
 */
export interface ABACResourceInfo {
  /** Resource sensitivity level (0-3) */
  sensitivity?: number;
  /** Resource status */
  status?: string;
  /** Owner tenant ID */
  tenantId?: string;
}

/**
 * ABAC policy configuration.
 */
export interface ABACPolicy {
  /** Allowed CIDR ranges for network access */
  allowedCidrs?: string[];
  /** Allowed country codes */
  allowedCountries?: string[];
  /** Blocked country codes (default: OFAC sanctions list) */
  blockedCountries?: string[];
  /** Business hours (UTC): [startHour, endHour] */
  businessHours?: [number, number];
  /** Business days: 1-7 (Monday-Sunday) */
  businessDays?: number[];
}

/**
 * Default ABAC policy.
 */
export const DEFAULT_ABAC_POLICY: ABACPolicy = {
  allowedCidrs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], // Private networks
  blockedCountries: [...BLOCKED_COUNTRIES_OFAC],
  businessHours: [9, 18], // 9:00-18:00 UTC
  businessDays: [1, 2, 3, 4, 5], // Mon-Fri
};

// =============================================================================
// Context Builders
// =============================================================================

/**
 * Builds time-based ABAC context.
 *
 * @example
 * ```typescript
 * const context = buildTimeContext();
 * // { current_time: "2026-01-23T12:00:00.000Z" }
 * ```
 */
export function buildTimeContext(timestamp?: Date): Pick<ABACContext, 'current_time'> {
  return {
    current_time: (timestamp ?? new Date()).toISOString(),
  };
}

/**
 * Builds network-based ABAC context from request.
 *
 * @example
 * ```typescript
 * const context = buildNetworkContext(req, {
 *   allowedCidrs: ['10.0.0.0/8'],
 * });
 * // { user_ip: "10.0.1.50", allowed_cidrs: ["10.0.0.0/8"] }
 * ```
 */
export function buildNetworkContext(
  request: ABACRequestInfo,
  policy?: Pick<ABACPolicy, 'allowedCidrs'>,
): Pick<ABACContext, 'user_ip' | 'allowed_cidrs'> {
  const ip = extractClientIp(request);

  const allowedCidrs = policy?.allowedCidrs ?? DEFAULT_ABAC_POLICY.allowedCidrs;
  return {
    user_ip: ip,
    ...(allowedCidrs !== undefined && { allowed_cidrs: allowedCidrs }),
  };
}

/**
 * Builds geo-location ABAC context from request.
 *
 * @example
 * ```typescript
 * const context = buildGeoContext(req, {
 *   allowedCountries: ['US', 'CA', 'DE'],
 *   blockedCountries: ['RU', 'KP'],
 * });
 * // { user_country: "US", allowed_countries: [...], blocked_countries: [...] }
 * ```
 */
export function buildGeoContext(
  request: ABACRequestInfo,
  policy?: Pick<ABACPolicy, 'allowedCountries' | 'blockedCountries'>,
): Pick<ABACContext, 'user_country' | 'allowed_countries' | 'blocked_countries'> {
  const country = extractCountryCode(request);

  const blockedCountries = policy?.blockedCountries ?? DEFAULT_ABAC_POLICY.blockedCountries;
  return {
    user_country: country,
    ...(policy?.allowedCountries !== undefined && { allowed_countries: policy.allowedCountries }),
    ...(blockedCountries !== undefined && { blocked_countries: blockedCountries }),
  };
}

/**
 * Builds resource attribute ABAC context.
 *
 * @example
 * ```typescript
 * const context = buildResourceContext(
 *   { clearance: 2 },
 *   { sensitivity: 1, status: 'active' },
 * );
 * // { user_clearance: 2, resource_sensitivity: 1, resource_status: "active" }
 * ```
 */
export function buildResourceContext(
  user: { clearance?: number },
  resource: ABACResourceInfo,
): Pick<ABACContext, 'user_clearance' | 'resource_sensitivity' | 'resource_status'> {
  return {
    ...(user.clearance !== undefined && { user_clearance: user.clearance }),
    ...(resource.sensitivity !== undefined && { resource_sensitivity: resource.sensitivity }),
    ...(resource.status !== undefined && { resource_status: resource.status }),
  };
}

/**
 * Builds complete ABAC context from request and resource.
 *
 * @example
 * ```typescript
 * const context = buildABACContext(req, {
 *   resource: { sensitivity: 2, status: 'active' },
 *   policy: { allowedCidrs: ['10.0.0.0/8'] },
 * });
 * ```
 */
export function buildABACContext(
  request: ABACRequestInfo,
  options?: {
    resource?: ABACResourceInfo;
    policy?: ABACPolicy;
    timestamp?: Date;
  },
): ABACContext {
  const policy = options?.policy ?? DEFAULT_ABAC_POLICY;

  return {
    // Time context
    ...buildTimeContext(options?.timestamp),

    // Network context
    ...buildNetworkContext(request, policy),

    // Geo context
    ...buildGeoContext(request, policy),

    // Resource context
    ...(options?.resource && request.user
      ? buildResourceContext(request.user, options.resource)
      : {}),
  };
}

// =============================================================================
// Extractors
// =============================================================================

/**
 * Extracts client IP address from request SECURELY.
 *
 * SEC-006: Only trusts X-Forwarded-For when request comes from a trusted proxy.
 * Takes RIGHTMOST non-trusted IP from XFF to prevent spoofing.
 *
 * @example
 * // Request from Cloudflare with XFF: "spoofed, real-client, cloudflare-edge"
 * // Direct IP: 103.21.244.50 (Cloudflare)
 * // Result: real-client (rightmost non-trusted)
 */
export function extractClientIp(
  request: ABACRequestInfo,
  trustedProxies: readonly string[] = DEFAULT_TRUSTED_PROXIES,
): string {
  const headers = request.headers ?? {};
  const directIp = request.ip;

  // If no direct IP, can't validate proxy chain
  if (!directIp || !isValidIp(directIp)) {
    return '0.0.0.0';
  }

  // Only trust XFF if request came from a known proxy
  if (isTrustedProxy(directIp, trustedProxies)) {
    const xff = headers['x-forwarded-for'];
    if (xff) {
      // Take RIGHTMOST non-trusted IP (prevents client spoofing leftmost)
      const ips = xff.split(',').map((ip) => ip.trim());
      for (let i = ips.length - 1; i >= 0; i--) {
        const ip = ips[i];
        if (ip && isValidIp(ip) && !isTrustedProxy(ip, trustedProxies)) {
          return ip;
        }
      }
    }

    // X-Real-IP as fallback
    const xri = headers['x-real-ip'];
    if (xri && isValidIp(xri)) return xri;
  }

  // Fallback to direct connection IP
  return directIp;
}

/**
 * Legacy extractClientIp without proxy validation.
 * @deprecated Use extractClientIp with trustedProxies parameter.
 */
export function extractClientIpUnsafe(request: ABACRequestInfo): string {
  const headers = request.headers ?? {};

  // X-Forwarded-For (first IP in chain) - INSECURE!
  const xff = headers['x-forwarded-for'];
  if (xff) {
    const firstIp = xff.split(',')[0]?.trim();
    if (firstIp && isValidIp(firstIp)) return firstIp;
  }

  // X-Real-IP
  const xri = headers['x-real-ip'];
  if (xri && isValidIp(xri)) return xri;

  // Direct connection
  if (request.ip && isValidIp(request.ip)) return request.ip;

  return '0.0.0.0';
}

/**
 * Extracts country code from request SECURELY.
 *
 * SEC-007: Only trusts CF-IPCountry when request comes from Cloudflare IP.
 * Custom x-country-code header is NEVER trusted (can be spoofed).
 */
export function extractCountryCode(
  request: ABACRequestInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _trustedProxies: readonly string[] = DEFAULT_TRUSTED_PROXIES,
): string {
  const headers = request.headers ?? {};
  const directIp = request.ip;

  // Only trust CF-IPCountry if request came from Cloudflare
  if (directIp && isCloudflareIp(directIp)) {
    const cfCountry = headers['cf-ipcountry'];
    if (cfCountry && cfCountry.length === 2) {
      return cfCountry.toUpperCase();
    }
  }

  // x-country-code is NOT trusted - removed for security
  // Attackers could send: curl -H "x-country-code: US" from sanctioned country

  return 'XX'; // Unknown - requires GeoIP lookup in production
}

/**
 * Legacy extractCountryCode without proxy validation.
 * @deprecated Use extractCountryCode with trustedProxies parameter.
 */
export function extractCountryCodeUnsafe(request: ABACRequestInfo): string {
  const headers = request.headers ?? {};

  // Cloudflare - INSECURE without IP validation!
  const cfCountry = headers['cf-ipcountry'];
  if (cfCountry && cfCountry.length === 2) return cfCountry.toUpperCase();

  // Custom header - INSECURE, can be spoofed!
  const xCountry = headers['x-country-code'];
  if (xCountry && xCountry.length === 2) return xCountry.toUpperCase();

  return 'XX'; // Unknown
}

// =============================================================================
// Validators
// =============================================================================

/**
 * Validates IP address format (IPv4 or IPv6).
 */
export function isValidIp(ip: string): boolean {
  // Simple IPv4 check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    return ip.split('.').every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  // Simple IPv6 check (contains colons)
  if (ip.includes(':')) {
    return /^[0-9a-fA-F:]+$/.test(ip);
  }

  return false;
}

/**
 * Checks if current time is within business hours.
 *
 * @example
 * ```typescript
 * const ok = isWithinBusinessHours(new Date(), { businessHours: [9, 18], businessDays: [1,2,3,4,5] });
 * ```
 */
export function isWithinBusinessHours(
  date: Date,
  policy?: Pick<ABACPolicy, 'businessHours' | 'businessDays'>,
): boolean {
  const [startHour, endHour] = policy?.businessHours ?? DEFAULT_ABAC_POLICY.businessHours!;
  const businessDays = policy?.businessDays ?? DEFAULT_ABAC_POLICY.businessDays!;

  const hour = date.getUTCHours();
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // Convert Sunday from 0 to 7

  return hour >= startHour && hour < endHour && businessDays.includes(day);
}

/**
 * Checks if user clearance is sufficient for resource sensitivity.
 */
export function isClearanceSufficient(userClearance: number, resourceSensitivity: number): boolean {
  return userClearance >= resourceSensitivity;
}

/**
 * Checks if country is not in blocked list.
 */
export function isCountryAllowed(
  country: string,
  policy?: Pick<ABACPolicy, 'allowedCountries' | 'blockedCountries'>,
): boolean {
  const { allowedCountries, blockedCountries } = policy ?? {};

  // Check blocked first (sanctions)
  if (blockedCountries?.includes(country)) return false;

  // If allowlist is defined, check it
  if (allowedCountries && allowedCountries.length > 0) {
    return allowedCountries.includes(country);
  }

  // If no allowlist, allow all non-blocked
  return true;
}

// =============================================================================
// Convenience: Pre-check ABAC locally
// =============================================================================

/**
 * Pre-checks ABAC conditions locally before calling OpenFGA.
 * Use this to fail fast and avoid network roundtrip for obvious failures.
 *
 * @returns undefined if all checks pass, or error message if failed
 *
 * @example
 * ```typescript
 * const error = preCheckABAC(context, { requireBusinessHours: true });
 * if (error) {
 *   throw new ForbiddenError(error);
 * }
 * // Proceed with OpenFGA check
 * ```
 */
export function preCheckABAC(
  context: ABACContext,
  requirements: {
    requireBusinessHours?: boolean;
    requireClearance?: number;
    requireActiveResource?: boolean;
    blockSanctionedCountries?: boolean;
  },
): string | undefined {
  // Business hours check
  if (requirements.requireBusinessHours && context.current_time) {
    const date = new Date(context.current_time);
    if (!isWithinBusinessHours(date)) {
      return 'Access denied: outside business hours';
    }
  }

  // Clearance check
  if (requirements.requireClearance !== undefined) {
    const userClearance = context.user_clearance ?? 0;
    if (!isClearanceSufficient(userClearance, requirements.requireClearance)) {
      return `Access denied: insufficient clearance (required: ${requirements.requireClearance}, have: ${userClearance})`;
    }
  }

  // Resource status check
  if (requirements.requireActiveResource && context.resource_status) {
    if (context.resource_status !== RESOURCE_STATUS.ACTIVE) {
      return `Access denied: resource is ${context.resource_status}`;
    }
  }

  // Sanctions check
  if (requirements.blockSanctionedCountries && context.user_country) {
    const blockedCountries: readonly string[] = context.blocked_countries ?? BLOCKED_COUNTRIES_OFAC;
    if (blockedCountries.includes(context.user_country)) {
      return 'Access denied: country is blocked';
    }
  }

  return undefined;
}

// =============================================================================
// Exports
// =============================================================================

export { CLEARANCE_LEVELS, RESOURCE_STATUS, BLOCKED_COUNTRIES_OFAC };
