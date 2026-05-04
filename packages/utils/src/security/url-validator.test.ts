import { describe, it, expect } from 'vitest';
import {
  validateWebhookUrl,
  validateWebhookUrlAsync,
  isUrlSafe,
  isUrlSafeAsync,
  SsrfError,
  parseAndValidateUrl,
} from './url-validator';

describe('url-validator', () => {
  describe('validateWebhookUrl', () => {
    describe('blocked hostnames', () => {
      it('should block localhost', () => {
        expect(() => validateWebhookUrl('https://localhost/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://localhost:8080/webhook')).toThrow(SsrfError);
      });

      it('should block localhost variants', () => {
        expect(() => validateWebhookUrl('https://app.localhost/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://test.local/webhook')).toThrow(SsrfError);
      });

      it('should block cloud metadata endpoints', () => {
        expect(() => validateWebhookUrl('https://metadata.google.internal/webhook')).toThrow(
          SsrfError,
        );
        expect(() => validateWebhookUrl('https://metadata.goog/webhook')).toThrow(SsrfError);
      });
    });

    describe('blocked IP addresses', () => {
      it('should block loopback', () => {
        expect(() => validateWebhookUrl('https://127.0.0.1/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://127.0.0.2/webhook')).toThrow(SsrfError);
      });

      it('should block AWS metadata endpoint', () => {
        expect(() =>
          validateWebhookUrl('http://169.254.169.254/latest/meta-data/', { allowHttp: true }),
        ).toThrow(SsrfError);
      });

      it('should block private Class A (10.x.x.x)', () => {
        expect(() => validateWebhookUrl('https://10.0.0.1/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://10.255.255.255/webhook')).toThrow(SsrfError);
      });

      it('should block private Class B (172.16-31.x.x)', () => {
        expect(() => validateWebhookUrl('https://172.16.0.1/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://172.31.255.255/webhook')).toThrow(SsrfError);
      });

      it('should block private Class C (192.168.x.x)', () => {
        expect(() => validateWebhookUrl('https://192.168.0.1/webhook')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('https://192.168.255.255/webhook')).toThrow(SsrfError);
      });

      it('should block link-local (169.254.x.x)', () => {
        expect(() => validateWebhookUrl('https://169.254.0.1/webhook')).toThrow(SsrfError);
      });
    });

    describe('IPv6-mapped IPv4 bypass prevention (RFC-055)', () => {
      it('should block ::ffff:127.0.0.1 (loopback bypass)', () => {
        expect(() =>
          validateWebhookUrl('https://[::ffff:127.0.0.1]/webhook', { allowHttp: true }),
        ).toThrow(SsrfError);
      });

      it('should block ::ffff:10.0.0.1 (private network bypass)', () => {
        expect(() =>
          validateWebhookUrl('https://[::ffff:10.0.0.1]/webhook', { allowHttp: true }),
        ).toThrow(SsrfError);
      });

      it('should block ::ffff:192.168.1.1 (private network bypass)', () => {
        expect(() =>
          validateWebhookUrl('https://[::ffff:192.168.1.1]/webhook', { allowHttp: true }),
        ).toThrow(SsrfError);
      });

      it('should block ::ffff:169.254.169.254 (AWS metadata bypass)', () => {
        expect(() =>
          validateWebhookUrl('https://[::ffff:169.254.169.254]/webhook', { allowHttp: true }),
        ).toThrow(SsrfError);
      });

      it('should allow ::ffff:8.8.8.8 (public IP)', () => {
        expect(() => validateWebhookUrl('https://[::ffff:8.8.8.8]/webhook')).not.toThrow();
      });

      it('should block full hex format 0:0:0:0:0:ffff:7f00:0001 (127.0.0.1)', () => {
        expect(() => validateWebhookUrl('https://[0:0:0:0:0:ffff:7f00:0001]/webhook')).toThrow(
          SsrfError,
        );
      });

      it('should block IPv4-compatible ::192.168.1.1', () => {
        expect(() => validateWebhookUrl('https://[::192.168.1.1]/webhook')).toThrow(SsrfError);
      });
    });

    describe('IPv6 private ranges (RFC-055 hardening)', () => {
      it('should block link-local fe80::', () => {
        expect(() => validateWebhookUrl('https://[fe80::1]/webhook')).toThrow(SsrfError);
      });

      it('should block link-local febf:: (edge of /10)', () => {
        expect(() => validateWebhookUrl('https://[febf::1]/webhook')).toThrow(SsrfError);
      });

      it('should block unique-local fc00::', () => {
        expect(() => validateWebhookUrl('https://[fc00::1]/webhook')).toThrow(SsrfError);
      });

      it('should block unique-local fd00::', () => {
        expect(() => validateWebhookUrl('https://[fd00::1]/webhook')).toThrow(SsrfError);
      });

      it('should block multicast ff02::', () => {
        expect(() => validateWebhookUrl('https://[ff02::1]/webhook')).toThrow(SsrfError);
      });

      it('should block loopback ::1', () => {
        expect(() => validateWebhookUrl('https://[::1]/webhook')).toThrow(SsrfError);
      });

      it('should block loopback 0:0:0:0:0:0:0:1', () => {
        expect(() => validateWebhookUrl('https://[0:0:0:0:0:0:0:1]/webhook')).toThrow(SsrfError);
      });

      it('should allow public IPv6', () => {
        expect(() => validateWebhookUrl('https://[2001:4860:4860::8888]/webhook')).not.toThrow();
      });
    });

    describe('protocol checks', () => {
      it('should block HTTP by default', () => {
        expect(() => validateWebhookUrl('http://api.example.com/webhook')).toThrow(SsrfError);
      });

      it('should allow HTTP when explicitly enabled', () => {
        expect(() =>
          validateWebhookUrl('http://api.example.com/webhook', { allowHttp: true }),
        ).not.toThrow();
      });

      it('should block non-HTTP protocols', () => {
        expect(() => validateWebhookUrl('file:///etc/passwd')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('ftp://example.com/file')).toThrow(SsrfError);
      });
    });

    describe('valid URLs', () => {
      it('should allow public HTTPS URLs', () => {
        expect(() => validateWebhookUrl('https://api.example.com/webhook')).not.toThrow();
        expect(() => validateWebhookUrl('https://hooks.slack.com/services/xxx')).not.toThrow();
        expect(() => validateWebhookUrl('https://discord.com/api/webhooks/xxx')).not.toThrow();
      });

      it('should allow public IP addresses', () => {
        expect(() => validateWebhookUrl('https://8.8.8.8/webhook')).not.toThrow();
        expect(() => validateWebhookUrl('https://1.1.1.1/webhook')).not.toThrow();
      });
    });

    describe('edge cases', () => {
      it('should block URLs with credentials', () => {
        expect(() => validateWebhookUrl('https://user:pass@api.example.com/webhook')).toThrow(
          SsrfError,
        );
      });

      it('should block numeric IP representations', () => {
        // 2130706433 = 127.0.0.1 in decimal
        expect(() => validateWebhookUrl('https://2130706433/webhook')).toThrow(SsrfError);
      });

      it('should reject invalid URLs', () => {
        expect(() => validateWebhookUrl('not-a-url')).toThrow(SsrfError);
        expect(() => validateWebhookUrl('')).toThrow(SsrfError);
      });
    });

    describe('custom options', () => {
      it('should block custom blocked hosts', () => {
        expect(() =>
          validateWebhookUrl('https://evil.com/webhook', { blockedHosts: ['evil.com'] }),
        ).toThrow(SsrfError);
      });

      it('should allow hosts in allowlist', () => {
        expect(() =>
          validateWebhookUrl('https://localhost/webhook', { allowedHosts: ['localhost'] }),
        ).not.toThrow();
      });
    });
  });

  describe('isUrlSafe', () => {
    it('should return true for safe URLs', () => {
      expect(isUrlSafe('https://api.example.com/webhook')).toBe(true);
    });

    it('should return false for unsafe URLs', () => {
      expect(isUrlSafe('https://localhost/webhook')).toBe(false);
      expect(isUrlSafe('https://127.0.0.1/webhook')).toBe(false);
      expect(isUrlSafe('not-a-url')).toBe(false);
    });
  });

  describe('parseAndValidateUrl', () => {
    it('should return parsed URL for safe URLs', () => {
      const url = parseAndValidateUrl('https://api.example.com/webhook?foo=bar');
      expect(url.hostname).toBe('api.example.com');
      expect(url.pathname).toBe('/webhook');
      expect(url.searchParams.get('foo')).toBe('bar');
    });

    it('should throw for unsafe URLs', () => {
      expect(() => parseAndValidateUrl('https://localhost/webhook')).toThrow(SsrfError);
    });
  });

  describe('validateWebhookUrlAsync', () => {
    it('should pass sync validation for safe URLs', async () => {
      // Without DNS protection, should behave like sync version
      await expect(
        validateWebhookUrlAsync('https://api.example.com/webhook'),
      ).resolves.toBeUndefined();
    });

    it('should block unsafe URLs even without DNS protection', async () => {
      await expect(validateWebhookUrlAsync('https://localhost/webhook')).rejects.toThrow(SsrfError);
    });

    it('should block private IPs even without DNS protection', async () => {
      await expect(validateWebhookUrlAsync('https://192.168.1.1/webhook')).rejects.toThrow(
        SsrfError,
      );
    });

    it('should skip DNS resolution for IP addresses', async () => {
      // Public IP should pass without DNS lookup
      await expect(
        validateWebhookUrlAsync('https://8.8.8.8/webhook', { dnsRebindingProtection: true }),
      ).resolves.toBeUndefined();
    });

    it('should skip DNS resolution for allowed hosts', async () => {
      await expect(
        validateWebhookUrlAsync('https://localhost/webhook', {
          dnsRebindingProtection: true,
          allowedHosts: ['localhost'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('isUrlSafeAsync', () => {
    it('should return true for safe URLs', async () => {
      await expect(isUrlSafeAsync('https://api.example.com/webhook')).resolves.toBe(true);
    });

    it('should return false for unsafe URLs', async () => {
      await expect(isUrlSafeAsync('https://localhost/webhook')).resolves.toBe(false);
      await expect(isUrlSafeAsync('https://127.0.0.1/webhook')).resolves.toBe(false);
    });
  });
});
