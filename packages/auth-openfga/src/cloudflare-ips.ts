/**
 * Cloudflare IP Ranges for Trusted Proxy Validation
 *
 * SEC-006: Only trust X-Forwarded-For and CF-IPCountry headers
 * when the request comes from a known Cloudflare IP.
 *
 * IP ranges are from: https://www.cloudflare.com/ips/
 * Last updated: 2026-01-23
 *
 * IMPORTANT: Update periodically from https://www.cloudflare.com/ips-v4 and /ips-v6
 *
 * @module @gertsai/auth-openfga
 */

/**
 * Cloudflare IPv4 CIDR ranges.
 * Source: https://www.cloudflare.com/ips-v4
 */
export const CLOUDFLARE_IPV4_RANGES = [
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
] as const;

/**
 * Cloudflare IPv6 CIDR ranges.
 * Source: https://www.cloudflare.com/ips-v6
 */
export const CLOUDFLARE_IPV6_RANGES = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
] as const;

/**
 * Common private/internal IP ranges that may be trusted proxies.
 * Use with caution - only add ranges you control.
 */
export const PRIVATE_IP_RANGES = [
  '10.0.0.0/8', // Class A private
  '172.16.0.0/12', // Class B private
  '192.168.0.0/16', // Class C private
  '127.0.0.0/8', // Loopback
  'fc00::/7', // IPv6 unique local
  '::1/128', // IPv6 loopback
] as const;

/**
 * Default trusted proxy configuration.
 * Includes Cloudflare and common private ranges.
 */
export const DEFAULT_TRUSTED_PROXIES = [
  ...CLOUDFLARE_IPV4_RANGES,
  ...CLOUDFLARE_IPV6_RANGES,
  ...PRIVATE_IP_RANGES,
] as const;

/**
 * Check if an IP is within a CIDR range.
 * Supports both IPv4 and IPv6.
 *
 * @example
 * isIpInCidr('103.21.244.10', '103.21.244.0/22') // true
 * isIpInCidr('8.8.8.8', '103.21.244.0/22') // false
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);

  // Handle IPv4
  if (ip.includes('.') && range.includes('.')) {
    const ipNum = ipv4ToNumber(ip);
    const rangeNum = ipv4ToNumber(range);
    const maskNum = mask === 0 ? 0 : ~((1 << (32 - mask)) - 1) >>> 0;
    return (ipNum & maskNum) === (rangeNum & maskNum);
  }

  // Handle IPv6
  if (ip.includes(':') && range.includes(':')) {
    const ipBigInt = ipv6ToBigInt(ip);
    const rangeBigInt = ipv6ToBigInt(range);
    const maskBigInt = (BigInt(1) << BigInt(128 - mask)) - BigInt(1);
    const inverseMask = ~maskBigInt;
    return (ipBigInt & inverseMask) === (rangeBigInt & inverseMask);
  }

  return false;
}

/**
 * Convert IPv4 to 32-bit number.
 */
function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Convert IPv6 to BigInt.
 * Handles full and abbreviated formats.
 */
function ipv6ToBigInt(ip: string): bigint {
  // Expand :: notation
  const parts = ip.split(':');
  const emptyIndex = parts.indexOf('');

  if (emptyIndex !== -1) {
    const missing = 8 - parts.filter((p) => p).length;
    const expanded = parts
      .slice(0, emptyIndex)
      .concat(Array(missing).fill('0'))
      .concat(parts.slice(emptyIndex + 1).filter((p) => p));
    return expanded.reduce(
      (acc, part) => (acc << BigInt(16)) + BigInt(parseInt(part || '0', 16)),
      BigInt(0),
    );
  }

  return parts.reduce((acc, part) => (acc << BigInt(16)) + BigInt(parseInt(part, 16)), BigInt(0));
}

/**
 * Check if an IP is from a trusted proxy.
 *
 * @param ip - IP address to check
 * @param trustedRanges - Array of trusted CIDR ranges
 */
export function isTrustedProxy(
  ip: string,
  trustedRanges: readonly string[] = DEFAULT_TRUSTED_PROXIES,
): boolean {
  return trustedRanges.some((cidr) => isIpInCidr(ip, cidr));
}

/**
 * Check if an IP is from Cloudflare.
 */
export function isCloudflareIp(ip: string): boolean {
  return [...CLOUDFLARE_IPV4_RANGES, ...CLOUDFLARE_IPV6_RANGES].some((cidr) =>
    isIpInCidr(ip, cidr),
  );
}
