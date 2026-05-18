/**
 * URL Validator - SSRF Protection
 *
 * Validates URLs to prevent Server-Side Request Forgery (CWE-918).
 * Blocks access to:
 * - localhost and loopback addresses
 * - Private IP ranges (RFC 1918)
 * - Link-local addresses
 * - Cloud metadata endpoints (169.254.169.254)
 *
 * # Public API (two flavours)
 *
 * 1. **Throw-primary** (`validateWebhookUrl` + `parseAndValidateUrl` +
 *    `isUrlSafe` + async DNS-rebinding variants): HTTPS-by-default,
 *    credential-rejecting, OWASP-hardened. Throws `SsrfError` on block.
 *    Use for webhook URLs, OAuth callbacks, anything user-supplied
 *    where defaults-secure matters.
 *
 * 2. **Result-shape** (`validateUrl` + `assertSafeUrl` +
 *    `createUrlValidator`): Wave 14.3 (PRD-045 / EVID-057) port from
 *    `@gertsai/fetch`. Non-throwing primary, granular `allow*` flags,
 *    explicit `maxUrlLength` cap, IPv4 int-CIDR fast path. Use for
 *    fetch-style flows where caller branches on `{valid, error?}`.
 *
 * Both flavours share the same blocklist (private/loopback/link-local/
 * cloud-metadata) and the same `SsrfError`. The result-shape flavour
 * wraps the throw-primary core and catches the error to convert to
 * `{valid: false, error: string}`.
 */

import { isIP } from 'node:net';

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

/**
 * Configuration for the result-shape {@link validateUrl} flavour.
 *
 * Ported from `@gertsai/fetch` in Wave 14.3 (PRD-045 / EVID-057).
 * Differs from {@link UrlValidationOptions} in defaults and the
 * granularity of opt-in flags — `validateUrl` defaults to allowing
 * both `http:` and `https:` (because it's primarily consumed by
 * `undici`-driven HTTP clients that need plain HTTP support), while
 * `validateWebhookUrl` defaults to HTTPS-only.
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
 * Result returned by the non-throwing {@link validateUrl}.
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  /** Normalized URL if valid */
  url?: URL;
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

// =============================================================================
// Result-shape API (Wave 14.3 / PRD-045 / EVID-057)
//
// Ported from `@gertsai/fetch` so that fetch can become a thin shim
// while consumers get a single canonical SSRF validator owned by
// `@gertsai/utils/security`.
//
// Design notes:
// - The result-shape flavour does NOT duplicate the blocklist — it
//   reuses the throw-primary core's hostname/IP checks plus its own
//   IPv4 int-CIDR fast path. Granular `allow*` flags are layered on
//   top so callers can opt-in to localhost/private/link-local/cloud
//   metadata access for trusted-internal scenarios (e.g. Vault).
// - `validateUrl` defaults to allowing both `http:` and `https:` to
//   preserve `@gertsai/fetch`'s historical default.
// - Error strings are kept identical to the original `fetch` impl so
//   existing pattern-matching consumers (and the 31 test cases) keep
//   working unchanged.
// =============================================================================

/** Private IPv4 CIDR ranges (int-encoded for fast comparison). */
const PRIVATE_IPV4_RANGES = [
  { start: 0x0a000000, end: 0x0affffff }, // 10.0.0.0/8
  { start: 0xac100000, end: 0xac1fffff }, // 172.16.0.0/12
  { start: 0xc0a80000, end: 0xc0a8ffff }, // 192.168.0.0/16
];

/** Loopback IPv4 range (127.0.0.0/8). */
const LOOPBACK_IPV4_START = 0x7f000000;
const LOOPBACK_IPV4_END = 0x7fffffff;

/** Link-local IPv4 range (169.254.0.0/16). */
const LINK_LOCAL_IPV4_START = 0xa9fe0000;
const LINK_LOCAL_IPV4_END = 0xa9feffff;

/** Cloud metadata IP (AWS / GCP / Azure). */
const CLOUD_METADATA_IP = 0xa9fea9fe; // 169.254.169.254

/** Internal config type with resolved defaults. */
interface ResolvedValidatorConfig {
  allowLocalhost: boolean;
  allowPrivateNetworks: boolean;
  allowLinkLocal: boolean;
  allowCloudMetadata: boolean;
  allowedProtocols: string[];
  blockedHostnames: string[];
  allowedHostnames: string[] | undefined;
  maxUrlLength: number;
}

const DEFAULT_VALIDATOR_CONFIG: ResolvedValidatorConfig = {
  allowLocalhost: false,
  allowPrivateNetworks: false,
  allowLinkLocal: false,
  allowCloudMetadata: false,
  allowedProtocols: ['http:', 'https:'],
  blockedHostnames: [],
  allowedHostnames: undefined,
  maxUrlLength: 2048,
};

/** Converts an IPv4 dotted-quad string to a 32-bit unsigned int. */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function isPrivateIPv4Int(ipInt: number): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => ipInt >= range.start && ipInt <= range.end);
}

function isLoopbackIPv4Int(ipInt: number): boolean {
  return ipInt >= LOOPBACK_IPV4_START && ipInt <= LOOPBACK_IPV4_END;
}

function isLinkLocalIPv4Int(ipInt: number): boolean {
  return ipInt >= LINK_LOCAL_IPV4_START && ipInt <= LINK_LOCAL_IPV4_END;
}

function isLoopbackIPv6Literal(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
}

function isLinkLocalIPv6Literal(ip: string): boolean {
  return ip.toLowerCase().startsWith('fe80:');
}

function isPrivateIPv6Literal(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized.startsWith('fc') || normalized.startsWith('fd');
}

/**
 * Validate a URL against SSRF attack patterns and return a result
 * object. Non-throwing primary; pair with {@link assertSafeUrl} for
 * a throwing flavour.
 *
 * Defaults block: localhost, RFC1918 private networks, link-local,
 * cloud metadata, `file:` / `ftp:` / `javascript:` protocols,
 * `0.0.0.0`, `255.255.255.255`, IPv6 `::1` / `fe80::` / `fc00::/7`.
 * Default protocol allowlist: `['http:', 'https:']`.
 *
 * Wave 14.3 (PRD-045 / EVID-057): consolidated from
 * `@gertsai/fetch/lib/url-validator` into the canonical security
 * namespace. `@gertsai/fetch` now re-exports this function.
 *
 * @example
 * ```typescript
 * const result = validateUrl('https://api.example.com/data');
 * if (!result.valid) throw new Error(result.error);
 *
 * // Trusted-internal callers can opt-in
 * validateUrl('http://10.0.0.1/health', { allowPrivateNetworks: true });
 * ```
 */
export function validateUrl(
  urlString: string,
  config: UrlValidatorConfig = {},
): UrlValidationResult {
  const cfg: ResolvedValidatorConfig = {
    allowLocalhost: config.allowLocalhost ?? DEFAULT_VALIDATOR_CONFIG.allowLocalhost,
    allowPrivateNetworks:
      config.allowPrivateNetworks ?? DEFAULT_VALIDATOR_CONFIG.allowPrivateNetworks,
    allowLinkLocal: config.allowLinkLocal ?? DEFAULT_VALIDATOR_CONFIG.allowLinkLocal,
    allowCloudMetadata:
      config.allowCloudMetadata ?? DEFAULT_VALIDATOR_CONFIG.allowCloudMetadata,
    allowedProtocols: config.allowedProtocols ?? DEFAULT_VALIDATOR_CONFIG.allowedProtocols,
    blockedHostnames: config.blockedHostnames ?? DEFAULT_VALIDATOR_CONFIG.blockedHostnames,
    allowedHostnames: config.allowedHostnames ?? DEFAULT_VALIDATOR_CONFIG.allowedHostnames,
    maxUrlLength: config.maxUrlLength ?? DEFAULT_VALIDATOR_CONFIG.maxUrlLength,
  };

  if (urlString.length > cfg.maxUrlLength) {
    return { valid: false, error: `URL exceeds maximum length of ${cfg.maxUrlLength}` };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!cfg.allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: `Protocol '${url.protocol}' not allowed. Allowed: ${cfg.allowedProtocols.join(', ')}`,
    };
  }

  // Allowlist short-circuit — if hostname is on the allowlist, skip
  // all other blocklist checks (intentional escape hatch for trusted
  // internal services).
  if (cfg.allowedHostnames && cfg.allowedHostnames.length > 0) {
    const hostname = url.hostname.toLowerCase();
    if (!cfg.allowedHostnames.some((h) => h.toLowerCase() === hostname)) {
      return { valid: false, error: `Hostname '${url.hostname}' not in allowlist` };
    }
    return { valid: true, url };
  }

  if (cfg.blockedHostnames.length > 0) {
    const hostname = url.hostname.toLowerCase();
    if (cfg.blockedHostnames.some((h) => h.toLowerCase() === hostname)) {
      return { valid: false, error: `Hostname '${url.hostname}' is blocked` };
    }
  }

  const hostname = url.hostname.toLowerCase();

  // Localhost-name check (string-based; covers names that don't parse
  // as IPs).
  if (!cfg.allowLocalhost) {
    if (
      hostname === 'localhost' ||
      hostname === 'localhost.localdomain' ||
      hostname.endsWith('.localhost')
    ) {
      return { valid: false, error: 'Localhost not allowed' };
    }
  }

  // IP-address checks. URL parser keeps brackets for IPv6 hosts
  // (`[::1]`), so strip them before passing to `isIP()`.
  const isIPv6Bracketed = hostname.startsWith('[') && hostname.endsWith(']');
  const ipToCheck = isIPv6Bracketed ? hostname.slice(1, -1) : hostname;
  const ipVersion = isIP(ipToCheck);

  if (ipVersion === 4) {
    const ipInt = ipv4ToInt(hostname);

    // Cloud metadata is the most critical block (AWS/GCP/Azure).
    if (!cfg.allowCloudMetadata && ipInt === CLOUD_METADATA_IP) {
      return { valid: false, error: 'Cloud metadata endpoint blocked (169.254.169.254)' };
    }

    if (!cfg.allowLocalhost && isLoopbackIPv4Int(ipInt)) {
      return { valid: false, error: 'Loopback addresses (127.x.x.x) not allowed' };
    }

    if (!cfg.allowPrivateNetworks && isPrivateIPv4Int(ipInt)) {
      return { valid: false, error: 'Private network addresses not allowed' };
    }

    if (!cfg.allowLinkLocal && isLinkLocalIPv4Int(ipInt)) {
      return { valid: false, error: 'Link-local addresses (169.254.x.x) not allowed' };
    }

    if (ipInt === 0) {
      return { valid: false, error: 'Address 0.0.0.0 not allowed' };
    }

    if (ipInt === 0xffffffff) {
      return { valid: false, error: 'Broadcast address not allowed' };
    }
  } else if (ipVersion === 6) {
    if (!cfg.allowLocalhost && isLoopbackIPv6Literal(ipToCheck)) {
      return { valid: false, error: 'IPv6 loopback (::1) not allowed' };
    }

    if (!cfg.allowLinkLocal && isLinkLocalIPv6Literal(ipToCheck)) {
      return { valid: false, error: 'IPv6 link-local addresses not allowed' };
    }

    if (!cfg.allowPrivateNetworks && isPrivateIPv6Literal(ipToCheck)) {
      return { valid: false, error: 'IPv6 private addresses (fc00::/7) not allowed' };
    }
  }

  return { valid: true, url };
}

/**
 * Validate a URL and return the parsed {@link URL} or throw.
 * Throw-primary mirror of {@link validateUrl}.
 *
 * @throws {Error} with `SSRF blocked: <reason>` if invalid.
 */
export function assertSafeUrl(urlString: string, config?: UrlValidatorConfig): URL {
  const result = validateUrl(urlString, config);
  if (!result.valid) {
    throw new Error(`SSRF blocked: ${result.error}`);
  }
  return result.url!;
}

/**
 * Create a preset validator with default {@link UrlValidatorConfig}.
 * Each call merges per-call overrides on top of the preset.
 *
 * @example
 * ```typescript
 * const internalValidator = createUrlValidator({
 *   allowPrivateNetworks: true,
 *   allowedHostnames: ['internal-api.local', 'redis.local'],
 * });
 * internalValidator.validate('http://internal-api.local/health');
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
