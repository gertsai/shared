/**
 * URL Validator - SSRF Protection
 *
 * Validates URLs to prevent Server-Side Request Forgery (CWE-918).
 * Blocks access to:
 * - localhost and loopback addresses
 * - Private IP ranges (RFC 1918)
 * - Link-local addresses
 * - Cloud metadata endpoints (169.254.169.254)
 */

// =============================================================================
// Types
// =============================================================================

export interface UrlValidationOptions {
  /** Allow HTTP (default: false, only HTTPS) */
  allowHttp?: boolean;
  /** Additional blocked hostnames */
  blockedHosts?: string[];
  /** Additional allowed hostnames (bypass checks) */
  allowedHosts?: string[];
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

// =============================================================================
// Constants
// =============================================================================

/** Blocked hostnames (case-insensitive) */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  // AWS/GCP/Azure metadata endpoints
  'metadata.google.internal',
  'metadata.goog',
]);

/** Blocked IP addresses */
const BLOCKED_IPS = new Set([
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '::',
  // AWS metadata
  '169.254.169.254',
  // Azure metadata
  '169.254.169.253',
]);

/** Private IP ranges (RFC 1918 + link-local + loopback) */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  // 127.0.0.0/8 - Loopback
  /^127\./,
  // 10.0.0.0/8 - Private Class A
  /^10\./,
  // 172.16.0.0/12 - Private Class B
  /^172\.(1[6-9]|2\d|3[01])\./,
  // 192.168.0.0/16 - Private Class C
  /^192\.168\./,
  // 169.254.0.0/16 - Link-local
  /^169\.254\./,
  // 0.0.0.0/8 - Current network
  /^0\./,
  // 100.64.0.0/10 - Carrier-grade NAT (RFC 6598)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // 198.18.0.0/15 - Benchmarking (RFC 2544)
  /^198\.1[89]\./,
];

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check if hostname is blocked
 */
function isBlockedHostname(hostname: string, options?: UrlValidationOptions): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Check allowlist first
  if (options?.allowedHosts?.includes(lowerHostname)) {
    return false;
  }

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(lowerHostname)) {
    return true;
  }

  // Check custom blocked hosts
  if (options?.blockedHosts?.includes(lowerHostname)) {
    return true;
  }

  // Check for localhost variants
  if (lowerHostname.endsWith('.localhost') || lowerHostname.endsWith('.local')) {
    return true;
  }

  return false;
}

/**
 * Check if IP address is private or blocked
 */
function isPrivateOrBlockedIp(ip: string): boolean {
  // Check exact blocked IPs
  if (BLOCKED_IPS.has(ip)) {
    return true;
  }

  // Check IPv4 private ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  // Check IPv6 private ranges
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  return false;
}

/**
 * Check if hostname looks like an IP address
 */
function isIpAddress(hostname: string): boolean {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  // IPv6 (simplified check)
  if (hostname.includes(':') && /^[\da-fA-F:]+$/.test(hostname)) {
    return true;
  }

  // IPv6 in brackets
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return true;
  }

  return false;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate a URL for SSRF protection
 *
 * @param url - URL string to validate
 * @param options - Validation options
 * @throws SsrfError if URL is blocked
 *
 * @example
 * ```typescript
 * import { validateWebhookUrl } from '@gerts/utils';
 *
 * // Throws SsrfError for blocked URLs
 * validateWebhookUrl('http://localhost:8080'); // throws
 * validateWebhookUrl('http://169.254.169.254/metadata'); // throws
 * validateWebhookUrl('http://10.0.0.1/internal'); // throws
 *
 * // Allows public URLs
 * validateWebhookUrl('https://api.example.com/webhook'); // ok
 * validateWebhookUrl('https://hooks.slack.com/services/...'); // ok
 * ```
 */
export function validateWebhookUrl(url: string, options?: UrlValidationOptions): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`Invalid URL format: ${url}`);
  }

  // Protocol check
  if (!options?.allowHttp && parsed.protocol !== 'https:') {
    throw new SsrfError(`Only HTTPS URLs are allowed: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Invalid protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check blocked hostnames
  if (isBlockedHostname(hostname, options)) {
    throw new SsrfError(`Blocked hostname: ${hostname}`);
  }

  // If hostname is an IP, check for private ranges
  if (isIpAddress(hostname)) {
    // Remove brackets from IPv6
    const ip = hostname.replace(/^\[|\]$/g, '');

    if (isPrivateOrBlockedIp(ip)) {
      throw new SsrfError(`Private or reserved IP address: ${ip}`);
    }
  }

  // Check for DNS rebinding tricks (numeric hostnames)
  // e.g., 2130706433 = 127.0.0.1 in decimal
  if (/^\d+$/.test(hostname)) {
    const num = parseInt(hostname, 10);
    if (!isNaN(num)) {
      // Convert to IP and check
      const ip = [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(
        '.',
      );

      if (isPrivateOrBlockedIp(ip)) {
        throw new SsrfError(`Blocked numeric IP: ${hostname} (${ip})`);
      }
    }
  }

  // Block URLs with username/password (can be used for credential theft)
  if (parsed.username || parsed.password) {
    throw new SsrfError('URLs with credentials are not allowed');
  }
}

/**
 * Check if URL is safe without throwing
 *
 * @param url - URL string to check
 * @param options - Validation options
 * @returns true if URL is safe, false otherwise
 */
export function isUrlSafe(url: string, options?: UrlValidationOptions): boolean {
  try {
    validateWebhookUrl(url, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate URL and return parsed URL object
 *
 * @param url - URL string to validate
 * @param options - Validation options
 * @returns Parsed URL object
 * @throws SsrfError if URL is blocked
 */
export function parseAndValidateUrl(url: string, options?: UrlValidationOptions): URL {
  validateWebhookUrl(url, options);
  return new URL(url);
}
