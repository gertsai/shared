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
  /** Enable DNS rebinding protection (async DNS resolution) */
  dnsRebindingProtection?: boolean;
  /** DNS resolution timeout in ms (default: 5000) */
  dnsTimeoutMs?: number;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * Result of async URL validation with DNS rebinding protection.
 *
 * NOTE: DNS rebinding protection requires caller cooperation. The returned
 * `resolvedIp` is the IP this validator confirmed safe at validation time.
 * For true rebinding protection, callers SHOULD fetch by the resolved IP
 * with an explicit `Host` header, e.g.:
 *   const result = await validateWebhookUrlAsync(url, { dnsRebindingProtection: true });
 *   if (result.valid && result.resolvedIp && result.url) {
 *     await fetch(`https://${result.resolvedIp}${result.url.pathname}`, {
 *       headers: { Host: result.url.host }
 *     });
 *   }
 */
export interface ValidationResultAsync {
  /** True if the URL passed all validation checks. */
  valid: boolean;
  /** Parsed URL object (present when valid === true). */
  url?: URL;
  /** Validation error if the URL was rejected. */
  error?: SsrfError;
  /**
   * The IP address that satisfied the validation. Populated when
   * DNS rebinding protection was enabled and DNS resolution succeeded.
   * Callers SHOULD use this IP to pin the actual fetch and avoid TOCTOU
   * (CWE-918) where DNS could return a different IP between validate and fetch.
   */
  resolvedIp?: string;
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
 * Convert hex IPv6 segment pair to IPv4 address
 */
function hexSegmentsToIPv4(high: string, low: string): string {
  const highNum = parseInt(high, 16);
  const lowNum = parseInt(low, 16);
  return `${(highNum >> 8) & 0xff}.${highNum & 0xff}.${(lowNum >> 8) & 0xff}.${lowNum & 0xff}`;
}

/**
 * Extract embedded IPv4 from IPv6-mapped address (RFC-055)
 *
 * IPv6-mapped IPv4 addresses can bypass naive IPv4 checks!
 * Handles all known formats:
 * - ::ffff:192.168.1.1 (standard)
 * - 0:0:0:0:0:ffff:192.168.1.1 (full with dotted)
 * - ::ffff:c0a8:0101 (hex suffix)
 * - 0:0:0:0:0:ffff:c0a8:0101 (full hex)
 *
 * @returns Extracted IPv4 address or null if not mapped
 */
function extractIPv4FromMapped(ip: string): string | null {
  const lower = ip.toLowerCase();

  // Standard format: ::ffff:192.168.1.1
  const standardMatch = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (standardMatch?.[1]) {
    return standardMatch[1];
  }

  // Full format with dotted decimal: 0:0:0:0:0:ffff:192.168.1.1
  // Allows variable leading zeros in each segment
  const fullDottedMatch = lower.match(/^0*:0*:0*:0*:0*:ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (fullDottedMatch?.[1]) {
    return fullDottedMatch[1];
  }

  // Hex format (short): ::ffff:c0a8:0101 (192.168.1.1 in hex)
  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch?.[1] && hexMatch[2]) {
    return hexSegmentsToIPv4(hexMatch[1], hexMatch[2]);
  }

  // Full hex format: 0:0:0:0:0:ffff:c0a8:0101
  const fullHexMatch = lower.match(/^0*:0*:0*:0*:0*:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (fullHexMatch?.[1] && fullHexMatch[2]) {
    return hexSegmentsToIPv4(fullHexMatch[1], fullHexMatch[2]);
  }

  // IPv4-compatible address (deprecated but still parsed): ::192.168.1.1
  const compatMatch = lower.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (compatMatch?.[1]) {
    return compatMatch[1];
  }

  // IPv4-compatible in hex (URL parser converts ::192.168.1.1 to ::c0a8:101)
  // Format: ::c0a8:101 (without ffff)
  const compatHexMatch = lower.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (compatHexMatch?.[1] && compatHexMatch[2]) {
    return hexSegmentsToIPv4(compatHexMatch[1], compatHexMatch[2]);
  }

  return null;
}

/**
 * Check if IP address is private or blocked
 */
function isPrivateOrBlockedIp(ip: string): boolean {
  // Check exact blocked IPs
  if (BLOCKED_IPS.has(ip)) {
    return true;
  }

  // RFC-055: Check IPv6-mapped IPv4 addresses (bypass prevention)
  const embeddedIPv4 = extractIPv4FromMapped(ip);
  if (embeddedIPv4) {
    // Recursively check the embedded IPv4
    return isPrivateOrBlockedIp(embeddedIPv4);
  }

  // Check IPv4 private ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  // Check IPv6 private/reserved ranges (RFC-055 hardening)
  const lowerIp = ip.toLowerCase();

  // fe80::/10 - Link-local (fe80:: through febf::)
  if (/^fe[89ab][0-9a-f]:/.test(lowerIp)) {
    return true;
  }

  // fc00::/7 - Unique local (fc00:: and fd00::)
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) {
    return true;
  }

  // fec0::/10 - Site-local (deprecated but still blocked)
  if (
    /^fec[0-9a-f]:/.test(lowerIp) ||
    /^fed[0-9a-f]:/.test(lowerIp) ||
    /^fee[0-9a-f]:/.test(lowerIp) ||
    /^fef[0-9a-f]:/.test(lowerIp)
  ) {
    return true;
  }

  // ff00::/8 - Multicast
  if (lowerIp.startsWith('ff')) {
    return true;
  }

  // ::1 - Loopback (various representations)
  if (
    lowerIp === '::1' ||
    lowerIp === '0:0:0:0:0:0:0:1' ||
    /^0+:0+:0+:0+:0+:0+:0+:0*1$/.test(lowerIp)
  ) {
    return true;
  }

  // :: - Unspecified address
  if (lowerIp === '::' || lowerIp === '0:0:0:0:0:0:0:0') {
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
 * import { validateWebhookUrl } from '@gertsai/utils';
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

// =============================================================================
// Async Validation with DNS Rebinding Protection (RFC-055)
// =============================================================================

/**
 * Race a promise against an AbortSignal so DNS lookups actually cancel on
 * timeout instead of running to completion (CWE-400). The underlying
 * `dns.resolve4` / `dns.resolve6` calls don't accept a signal, so we
 * surface a rejection as soon as the controller aborts and let the
 * background DNS work resolve into the void.
 */
/** @internal Exported only for testing. Not part of the public API. */
export async function _abortableResolveForTest(
  fn: () => Promise<string[]>,
  signal: AbortSignal,
): Promise<string[]> {
  return abortableResolve(fn, signal);
}

async function abortableResolve(
  fn: () => Promise<string[]>,
  signal: AbortSignal,
): Promise<string[]> {
  if (signal.aborted) {
    throw new Error('DNS resolution aborted (pre-abort)');
  }
  return await Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      const onAbort = () => reject(new Error('DNS resolution aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
}

/**
 * Resolve hostname to IP addresses with a hard timeout. Timeout now
 * actually aborts the resolution promise (see `abortableResolve`).
 */
async function resolveHostname(
  hostname: string,
  timeoutMs: number,
): Promise<{ ipv4: string[]; ipv6: string[] }> {
  // Dynamic import to avoid issues in browser environments
  const dns = await import('dns').then((m) => m.promises);

  const result = { ipv4: [] as string[], ipv6: [] as string[] };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try to resolve IPv4
    try {
      result.ipv4 = await abortableResolve(() => dns.resolve4(hostname), controller.signal);
    } catch {
      // No A records or aborted - that's OK, IPv6 may still resolve
    }

    // Try to resolve IPv6
    try {
      result.ipv6 = await abortableResolve(() => dns.resolve6(hostname), controller.signal);
    } catch {
      // No AAAA records or aborted - that's OK
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return result;
}

/**
 * Validate a URL with DNS rebinding protection (async)
 *
 * This function performs actual DNS resolution and validates the resolved IPs.
 * Use when you need protection against DNS rebinding attacks.
 *
 * Returns a {@link ValidationResultAsync} that includes the resolved IP that
 * passed validation. Callers SHOULD pin the subsequent fetch to this IP to
 * close the TOCTOU window (CWE-918) where a malicious DNS server could
 * return a different IP between validation and the actual request.
 *
 * @param url - URL string to validate
 * @param options - Validation options (including dnsRebindingProtection)
 * @throws SsrfError if URL is blocked or resolves to blocked IP
 *
 * @example
 * ```typescript
 * // With DNS protection (slower, more secure)
 * const result = await validateWebhookUrlAsync('https://example.com/webhook', {
 *   dnsRebindingProtection: true,
 *   dnsTimeoutMs: 5000,
 * });
 * if (result.valid && result.resolvedIp && result.url) {
 *   // Pin the fetch to the resolved IP + explicit Host header
 *   await fetch(`https://${result.resolvedIp}${result.url.pathname}`, {
 *     headers: { Host: result.url.host },
 *   });
 * }
 * ```
 */
export async function validateWebhookUrlAsync(
  url: string,
  options?: UrlValidationOptions,
): Promise<ValidationResultAsync> {
  // First, run sync validation
  validateWebhookUrl(url, options);

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  // If DNS rebinding protection is not enabled, we're done
  if (!options?.dnsRebindingProtection) {
    return { valid: true, url: parsed };
  }

  // Skip DNS resolution for IP addresses (already validated in sync function).
  // The literal IP IS the resolved IP — pin it for the caller.
  if (isIpAddress(hostname)) {
    const literalIp = hostname.replace(/^\[|\]$/g, '');
    return { valid: true, url: parsed, resolvedIp: literalIp };
  }

  // Skip for allowed hosts
  if (options?.allowedHosts?.includes(hostname)) {
    return { valid: true, url: parsed };
  }

  // Resolve DNS and validate IPs
  const timeoutMs = options?.dnsTimeoutMs ?? 5000;

  try {
    const resolved = await resolveHostname(hostname, timeoutMs);

    // Check all resolved IPv4 addresses
    for (const ip of resolved.ipv4) {
      if (isPrivateOrBlockedIp(ip)) {
        throw new SsrfError(`DNS resolved to blocked IP: ${hostname} → ${ip}`);
      }
    }

    // Check all resolved IPv6 addresses
    for (const ip of resolved.ipv6) {
      if (isPrivateOrBlockedIp(ip)) {
        throw new SsrfError(`DNS resolved to blocked IPv6: ${hostname} → ${ip}`);
      }
    }

    // If no IPs resolved, that's suspicious
    if (resolved.ipv4.length === 0 && resolved.ipv6.length === 0) {
      throw new SsrfError(`DNS resolution failed for: ${hostname}`);
    }

    // Pick the first IP that passed validation. Preference: IPv4 (most
    // common transport), fall back to IPv6. Caller pins the fetch to it.
    const resolvedIp = resolved.ipv4[0] ?? resolved.ipv6[0];
    const result: ValidationResultAsync = { valid: true, url: parsed };
    if (resolvedIp !== undefined) {
      result.resolvedIp = resolvedIp;
    }
    return result;
  } catch (err) {
    if (err instanceof SsrfError) {
      throw err;
    }
    // DNS resolution error - block by default for security
    throw new SsrfError(`DNS resolution error for ${hostname}: ${(err as Error).message}`);
  }
}

/**
 * Check if URL is safe with async DNS validation
 */
export async function isUrlSafeAsync(
  url: string,
  options?: UrlValidationOptions,
): Promise<boolean> {
  try {
    await validateWebhookUrlAsync(url, options);
    return true;
  } catch {
    return false;
  }
}
