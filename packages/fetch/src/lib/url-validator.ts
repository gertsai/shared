/**
 * URL validation utilities to prevent SSRF attacks.
 *
 * @module lib/url-validator
 * @description Validates URLs against blocklists of private/internal networks
 * to prevent Server-Side Request Forgery (SSRF) vulnerabilities.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { URL } from 'node:url';
import { isIP } from 'node:net';

/**
 * Configuration for URL validation.
 */
export interface UrlValidatorConfig {
  /** Allow localhost (127.0.0.1, ::1, localhost). Default: false */
  allowLocalhost?: boolean;
  /** Allow private networks (10.x, 172.16-31.x, 192.168.x). Default: false */
  allowPrivateNetworks?: boolean;
  /** Allow link-local addresses (169.254.x.x, fe80::). Default: false */
  allowLinkLocal?: boolean;
  /** Allow cloud metadata endpoints (169.254.169.254). Default: false */
  allowCloudMetadata?: boolean;
  /** Allowed protocols. Default: ['http:', 'https:'] */
  allowedProtocols?: string[];
  /** Blocked hostnames (exact match). Default: [] */
  blockedHostnames?: string[];
  /** Allowed hostnames (if set, ONLY these are allowed). Default: undefined */
  allowedHostnames?: string[];
  /** Maximum URL length. Default: 2048 */
  maxUrlLength?: number;
}

/**
 * Result of URL validation.
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  /** Normalized URL if valid */
  url?: URL;
}

/** Private IPv4 CIDR ranges */
const PRIVATE_IPV4_RANGES = [
  { start: 0x0a000000, end: 0x0affffff }, // 10.0.0.0/8
  { start: 0xac100000, end: 0xac1fffff }, // 172.16.0.0/12
  { start: 0xc0a80000, end: 0xc0a8ffff }, // 192.168.0.0/16
];

/** Loopback ranges */
const LOOPBACK_IPV4_START = 0x7f000000; // 127.0.0.0
const LOOPBACK_IPV4_END = 0x7fffffff; // 127.255.255.255

/** Link-local range */
const LINK_LOCAL_IPV4_START = 0xa9fe0000; // 169.254.0.0
const LINK_LOCAL_IPV4_END = 0xa9feffff; // 169.254.255.255

/** Cloud metadata IP (AWS, GCP, Azure) */
const CLOUD_METADATA_IP = 0xa9fea9fe; // 169.254.169.254

/** Internal config type with resolved defaults */
type ResolvedConfig = {
  allowLocalhost: boolean;
  allowPrivateNetworks: boolean;
  allowLinkLocal: boolean;
  allowCloudMetadata: boolean;
  allowedProtocols: string[];
  blockedHostnames: string[];
  allowedHostnames: string[] | undefined;
  maxUrlLength: number;
};

/** Default configuration */
const DEFAULT_CONFIG: ResolvedConfig = {
  allowLocalhost: false,
  allowPrivateNetworks: false,
  allowLinkLocal: false,
  allowCloudMetadata: false,
  allowedProtocols: ['http:', 'https:'],
  blockedHostnames: [],
  allowedHostnames: undefined,
  maxUrlLength: 2048,
};

/**
 * Converts IPv4 string to 32-bit integer.
 * @internal
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Checks if an IPv4 address is in a private range.
 * @internal
 */
function isPrivateIPv4(ipInt: number): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => ipInt >= range.start && ipInt <= range.end);
}

/**
 * Checks if an IPv4 address is loopback (127.x.x.x).
 * @internal
 */
function isLoopbackIPv4(ipInt: number): boolean {
  return ipInt >= LOOPBACK_IPV4_START && ipInt <= LOOPBACK_IPV4_END;
}

/**
 * Checks if an IPv4 address is link-local (169.254.x.x).
 * @internal
 */
function isLinkLocalIPv4(ipInt: number): boolean {
  return ipInt >= LINK_LOCAL_IPV4_START && ipInt <= LINK_LOCAL_IPV4_END;
}

/**
 * Checks if an IPv6 address is loopback (::1).
 * @internal
 */
function isLoopbackIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
}

/**
 * Checks if an IPv6 address is link-local (fe80::/10).
 * @internal
 */
function isLinkLocalIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized.startsWith('fe80:') || normalized.startsWith('fe80::');
}

/**
 * Checks if an IPv6 address is private (fc00::/7 - ULA).
 * @internal
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized.startsWith('fc') || normalized.startsWith('fd');
}

/**
 * Validates a URL against SSRF attack patterns.
 *
 * @param urlString - URL string to validate
 * @param config - Validation configuration
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateUrl('https://api.example.com/data');
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 *
 * // Block internal access
 * validateUrl('http://localhost:6379'); // { valid: false, error: 'Localhost not allowed' }
 * validateUrl('http://169.254.169.254'); // { valid: false, error: 'Cloud metadata endpoint blocked' }
 * validateUrl('http://192.168.1.1'); // { valid: false, error: 'Private network addresses not allowed' }
 * ```
 */
export function validateUrl(
  urlString: string,
  config: UrlValidatorConfig = {},
): UrlValidationResult {
  // Merge with defaults, ensuring arrays are never undefined
  const cfg: ResolvedConfig = {
    allowLocalhost: config.allowLocalhost ?? DEFAULT_CONFIG.allowLocalhost,
    allowPrivateNetworks: config.allowPrivateNetworks ?? DEFAULT_CONFIG.allowPrivateNetworks,
    allowLinkLocal: config.allowLinkLocal ?? DEFAULT_CONFIG.allowLinkLocal,
    allowCloudMetadata: config.allowCloudMetadata ?? DEFAULT_CONFIG.allowCloudMetadata,
    allowedProtocols: config.allowedProtocols ?? DEFAULT_CONFIG.allowedProtocols,
    blockedHostnames: config.blockedHostnames ?? DEFAULT_CONFIG.blockedHostnames,
    allowedHostnames: config.allowedHostnames ?? DEFAULT_CONFIG.allowedHostnames,
    maxUrlLength: config.maxUrlLength ?? DEFAULT_CONFIG.maxUrlLength,
  };

  // Check URL length
  if (urlString.length > cfg.maxUrlLength) {
    return { valid: false, error: `URL exceeds maximum length of ${cfg.maxUrlLength}` };
  }

  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!cfg.allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: `Protocol '${url.protocol}' not allowed. Allowed: ${cfg.allowedProtocols.join(', ')}`,
    };
  }

  // Check hostname allowlist (if configured)
  if (cfg.allowedHostnames && cfg.allowedHostnames.length > 0) {
    const hostname = url.hostname.toLowerCase();
    if (!cfg.allowedHostnames.some((h) => h.toLowerCase() === hostname)) {
      return { valid: false, error: `Hostname '${url.hostname}' not in allowlist` };
    }
    // If in allowlist, skip other checks
    return { valid: true, url };
  }

  // Check hostname blocklist
  if (cfg.blockedHostnames.length > 0) {
    const hostname = url.hostname.toLowerCase();
    if (cfg.blockedHostnames.some((h) => h.toLowerCase() === hostname)) {
      return { valid: false, error: `Hostname '${url.hostname}' is blocked` };
    }
  }

  const hostname = url.hostname.toLowerCase();

  // Check localhost names
  if (!cfg.allowLocalhost) {
    if (
      hostname === 'localhost' ||
      hostname === 'localhost.localdomain' ||
      hostname.endsWith('.localhost')
    ) {
      return { valid: false, error: 'Localhost not allowed' };
    }
  }

  // Check if hostname is an IP address
  // Note: URL parser keeps brackets for IPv6, so [::1] stays as [::1]
  // We need to extract the IP without brackets for isIP() check
  const isIPv6Bracketed = hostname.startsWith('[') && hostname.endsWith(']');
  const ipToCheck = isIPv6Bracketed ? hostname.slice(1, -1) : hostname;
  const ipVersion = isIP(ipToCheck);

  if (ipVersion === 4) {
    const ipInt = ipv4ToInt(hostname);

    // Cloud metadata check (most critical - AWS/GCP/Azure)
    if (!cfg.allowCloudMetadata && ipInt === CLOUD_METADATA_IP) {
      return { valid: false, error: 'Cloud metadata endpoint blocked (169.254.169.254)' };
    }

    // Loopback check
    if (!cfg.allowLocalhost && isLoopbackIPv4(ipInt)) {
      return { valid: false, error: 'Loopback addresses (127.x.x.x) not allowed' };
    }

    // Private network check
    if (!cfg.allowPrivateNetworks && isPrivateIPv4(ipInt)) {
      return { valid: false, error: 'Private network addresses not allowed' };
    }

    // Link-local check
    if (!cfg.allowLinkLocal && isLinkLocalIPv4(ipInt)) {
      return { valid: false, error: 'Link-local addresses (169.254.x.x) not allowed' };
    }

    // 0.0.0.0 check
    if (ipInt === 0) {
      return { valid: false, error: 'Address 0.0.0.0 not allowed' };
    }

    // Broadcast check
    if (ipInt === 0xffffffff) {
      return { valid: false, error: 'Broadcast address not allowed' };
    }
  } else if (ipVersion === 6) {
    // IPv6 checks (use ipToCheck without brackets)
    if (!cfg.allowLocalhost && isLoopbackIPv6(ipToCheck)) {
      return { valid: false, error: 'IPv6 loopback (::1) not allowed' };
    }

    if (!cfg.allowLinkLocal && isLinkLocalIPv6(ipToCheck)) {
      return { valid: false, error: 'IPv6 link-local addresses not allowed' };
    }

    if (!cfg.allowPrivateNetworks && isPrivateIPv6(ipToCheck)) {
      return { valid: false, error: 'IPv6 private addresses (fc00::/7) not allowed' };
    }
  }

  return { valid: true, url };
}

/**
 * Validates URL and throws if invalid.
 *
 * @param urlString - URL to validate
 * @param config - Validation configuration
 * @throws {Error} If URL is invalid or blocked
 * @returns Parsed URL object
 *
 * @example
 * ```typescript
 * try {
 *   const url = assertSafeUrl('http://169.254.169.254/latest/meta-data');
 * } catch (error) {
 *   // Error: Cloud metadata endpoint blocked (169.254.169.254)
 * }
 * ```
 */
export function assertSafeUrl(urlString: string, config?: UrlValidatorConfig): URL {
  const result = validateUrl(urlString, config);
  if (!result.valid) {
    throw new Error(`SSRF blocked: ${result.error}`);
  }
  return result.url!;
}

/**
 * Creates a URL validator with preset configuration.
 *
 * @param config - Default configuration for all validations
 * @returns Configured validator functions
 *
 * @example
 * ```typescript
 * // Create validator that allows internal access for specific service
 * const internalValidator = createUrlValidator({
 *   allowPrivateNetworks: true,
 *   allowedHostnames: ['internal-api.local', 'redis.local'],
 * });
 *
 * internalValidator.validate('http://internal-api.local/health'); // valid
 * internalValidator.assert('http://evil.com'); // throws
 * ```
 */
export function createUrlValidator(config: UrlValidatorConfig = {}) {
  return {
    validate: (url: string, overrides?: UrlValidatorConfig) =>
      validateUrl(url, { ...config, ...overrides }),
    assert: (url: string, overrides?: UrlValidatorConfig) =>
      assertSafeUrl(url, { ...config, ...overrides }),
  };
}
