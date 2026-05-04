/**
 * SEC-001: IP Extraction Utilities
 *
 * Safe IP extraction from HTTP requests to prevent IP spoofing attacks
 * in rate limiting and audit logging scenarios.
 *
 * @packageDocumentation
 */

/**
 * Request-like object with headers and socket info
 */
export interface IpExtractableRequest {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * Configuration for IP extraction
 */
export interface IpExtractionConfig {
  /**
   * Trust X-Real-IP header (usually from nginx/traefik)
   * @default true
   */
  trustRealIp?: boolean;

  /**
   * Trust X-Forwarded-For header
   * @default true
   */
  trustForwardedFor?: boolean;

  /**
   * Which IP to extract from X-Forwarded-For chain:
   * - 'last': Last IP in chain (closest proxy, more secure)
   * - 'first': First IP in chain (original client, less secure)
   * @default 'last'
   */
  forwardedForStrategy?: 'last' | 'first';
}

const DEFAULT_CONFIG: Required<IpExtractionConfig> = {
  trustRealIp: true,
  trustForwardedFor: true,
  forwardedForStrategy: 'last',
};

/**
 * Extracts client IP address safely from HTTP request
 *
 * Security considerations:
 * - X-Forwarded-For can be spoofed by clients adding fake IPs at the start
 * - In trusted proxy setup, the LAST IP is added by our proxy (nginx/traefik)
 * - X-Real-IP is typically set by nginx and is more reliable
 *
 * @param req - HTTP request object with headers and socket
 * @param config - Extraction configuration
 * @returns Client IP address or 'unknown'
 *
 * @example
 * ```typescript
 * // Basic usage
 * const ip = extractClientIp(req);
 *
 * // Use first IP from X-Forwarded-For (less secure, for backwards compat)
 * const ip = extractClientIp(req, { forwardedForStrategy: 'first' });
 *
 * // Don't trust any proxy headers (direct connection only)
 * const ip = extractClientIp(req, {
 *   trustRealIp: false,
 *   trustForwardedFor: false
 * });
 * ```
 */
export function extractClientIp(
  req: IpExtractableRequest,
  config: IpExtractionConfig = {},
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. X-Real-IP from nginx/traefik (most reliable in proper setup)
  if (cfg.trustRealIp) {
    const realIp = req.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      const ip = realIp.trim();
      if (isValidIpFormat(ip)) {
        return ip;
      }
    }
  }

  // 2. X-Forwarded-For chain
  if (cfg.trustForwardedFor) {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const ips = xff
        .split(',')
        .map((ip) => ip.trim())
        .filter((ip) => ip && isValidIpFormat(ip));

      if (ips.length > 0) {
        // SEC-001: Use LAST IP (from our trusted proxy) by default
        // This prevents spoofing where attacker adds fake IPs at the start
        const selectedIp = cfg.forwardedForStrategy === 'last' ? ips[ips.length - 1] : ips[0];
        return selectedIp;
      }
    }
  }

  // 3. Direct socket connection
  const socketIp = req.socket?.remoteAddress;
  if (socketIp && isValidIpFormat(socketIp)) {
    // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
    if (socketIp.startsWith('::ffff:')) {
      return socketIp.substring(7);
    }
    return socketIp;
  }

  return 'unknown';
}

/**
 * Validates basic IP address format (IPv4 or IPv6)
 *
 * This is a lightweight check to filter obvious garbage, not full IP validation.
 *
 * @param ip - String to validate
 * @returns True if looks like valid IP format
 */
export function isValidIpFormat(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // Max reasonable length for IPv6 with zone identifier
  if (ip.length > 50) {
    return false;
  }

  // Block obvious injection attempts
  if (/[\r\n\0]/.test(ip)) {
    return false;
  }

  // IPv4 pattern: digits and dots
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    // Validate octets are 0-255
    const octets = ip.split('.').map(Number);
    return octets.every((o) => o >= 0 && o <= 255);
  }

  // IPv6 pattern: hex digits and colons (simplified)
  // Covers full, compressed, and IPv4-mapped formats
  const ipv6Pattern =
    /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (ipv6Pattern.test(ip)) {
    return true;
  }

  return false;
}
