/**
 * Tests for IP extraction utilities (SEC-001)
 */
import { describe, it, expect } from 'vitest';
import { extractClientIp, isValidIpFormat } from './ip-utils';

describe('extractClientIp', () => {
  describe('X-Real-IP handling', () => {
    it('should use X-Real-IP when present', () => {
      const req = {
        headers: {
          'x-real-ip': '192.168.1.100',
          'x-forwarded-for': 'spoofed-ip, 10.0.0.1',
        },
      };

      expect(extractClientIp(req)).toBe('192.168.1.100');
    });

    it('should trim X-Real-IP value', () => {
      const req = {
        headers: {
          'x-real-ip': '  192.168.1.100  ',
        },
      };

      expect(extractClientIp(req)).toBe('192.168.1.100');
    });

    it('should skip invalid X-Real-IP', () => {
      const req = {
        headers: {
          'x-real-ip': 'invalid-ip',
        },
        socket: { remoteAddress: '127.0.0.1' },
      };

      expect(extractClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('X-Forwarded-For handling (SEC-001)', () => {
    it('should use LAST IP by default to prevent spoofing', () => {
      const req = {
        headers: {
          'x-forwarded-for': 'spoofed-by-attacker, 10.0.0.1, 172.16.0.1',
        },
      };

      // Should return last IP (from trusted proxy), not first (attacker-controlled)
      expect(extractClientIp(req)).toBe('172.16.0.1');
    });

    it('should use first IP when configured for backwards compat', () => {
      const req = {
        headers: {
          'x-forwarded-for': '10.0.0.100, 192.168.1.1, 172.16.0.1',
        },
      };

      expect(extractClientIp(req, { forwardedForStrategy: 'first' })).toBe('10.0.0.100');
    });

    it('should handle single IP in X-Forwarded-For', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      };

      expect(extractClientIp(req)).toBe('192.168.1.1');
    });

    it('should skip invalid IPs in chain', () => {
      const req = {
        headers: {
          'x-forwarded-for': 'invalid, also-invalid, 10.0.0.1',
        },
      };

      expect(extractClientIp(req)).toBe('10.0.0.1');
    });
  });

  describe('socket fallback', () => {
    it('should use socket IP when no proxy headers', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      expect(extractClientIp(req)).toBe('127.0.0.1');
    });

    it('should strip IPv6-mapped IPv4 prefix', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.1' },
      };

      expect(extractClientIp(req)).toBe('192.168.1.1');
    });

    it('should return unknown when no IP available', () => {
      const req = {
        headers: {},
      };

      expect(extractClientIp(req)).toBe('unknown');
    });
  });

  describe('configuration options', () => {
    it('should skip X-Real-IP when not trusted', () => {
      const req = {
        headers: {
          'x-real-ip': '10.0.0.1',
          'x-forwarded-for': '192.168.1.1',
        },
      };

      expect(extractClientIp(req, { trustRealIp: false })).toBe('192.168.1.1');
    });

    it('should skip X-Forwarded-For when not trusted', () => {
      const req = {
        headers: {
          'x-forwarded-for': '10.0.0.1',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      expect(extractClientIp(req, { trustForwardedFor: false })).toBe('192.168.1.1');
    });

    it('should fall back to socket when no headers trusted', () => {
      const req = {
        headers: {
          'x-real-ip': '10.0.0.1',
          'x-forwarded-for': '10.0.0.2',
        },
        socket: { remoteAddress: '127.0.0.1' },
      };

      expect(
        extractClientIp(req, {
          trustRealIp: false,
          trustForwardedFor: false,
        }),
      ).toBe('127.0.0.1');
    });
  });
});

describe('isValidIpFormat', () => {
  describe('IPv4 validation', () => {
    it('should accept valid IPv4', () => {
      expect(isValidIpFormat('192.168.1.1')).toBe(true);
      expect(isValidIpFormat('10.0.0.1')).toBe(true);
      expect(isValidIpFormat('0.0.0.0')).toBe(true);
      expect(isValidIpFormat('255.255.255.255')).toBe(true);
    });

    it('should reject invalid IPv4 octets', () => {
      expect(isValidIpFormat('256.1.1.1')).toBe(false);
      expect(isValidIpFormat('1.1.1.256')).toBe(false);
      expect(isValidIpFormat('999.999.999.999')).toBe(false);
    });
  });

  describe('IPv6 validation', () => {
    it('should accept valid IPv6', () => {
      expect(isValidIpFormat('::1')).toBe(true);
      expect(isValidIpFormat('2001:db8::')).toBe(true);
      expect(isValidIpFormat('::ffff:192.168.1.1')).toBe(true);
    });
  });

  describe('injection prevention', () => {
    it('should reject CRLF injection attempts', () => {
      expect(isValidIpFormat('10.0.0.1\r\nSET hack 1')).toBe(false);
      expect(isValidIpFormat('10.0.0.1\n')).toBe(false);
      expect(isValidIpFormat('10.0.0.1\r')).toBe(false);
    });

    it('should reject null byte injection', () => {
      expect(isValidIpFormat('10.0.0.1\0evil')).toBe(false);
    });

    it('should reject overly long strings', () => {
      expect(isValidIpFormat('a'.repeat(100))).toBe(false);
    });

    it('should reject empty/null values', () => {
      expect(isValidIpFormat('')).toBe(false);
      expect(isValidIpFormat(null as any)).toBe(false);
      expect(isValidIpFormat(undefined as any)).toBe(false);
    });
  });
});
