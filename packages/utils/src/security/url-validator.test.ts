import { describe, it, expect } from 'vitest';
import {
  validateWebhookUrl,
  validateWebhookUrlAsync,
  isUrlSafe,
  isUrlSafeAsync,
  SsrfError,
  parseAndValidateUrl,
  _abortableResolveForTest,
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
      // Without DNS protection, returns a ValidationResultAsync with valid=true.
      const result = await validateWebhookUrlAsync('https://api.example.com/webhook');
      expect(result.valid).toBe(true);
      expect(result.url).toBeInstanceOf(URL);
      expect(result.url?.host).toBe('api.example.com');
      // No DNS lookup performed → resolvedIp not populated
      expect(result.resolvedIp).toBeUndefined();
    });

    it('should block unsafe URLs even without DNS protection', async () => {
      await expect(validateWebhookUrlAsync('https://localhost/webhook')).rejects.toThrow(SsrfError);
    });

    it('should block private IPs even without DNS protection', async () => {
      await expect(validateWebhookUrlAsync('https://192.168.1.1/webhook')).rejects.toThrow(
        SsrfError,
      );
    });

    it('should skip DNS resolution for IP addresses and pin the literal IP', async () => {
      // Public IP should pass without DNS lookup; resolvedIp = the literal IP
      const result = await validateWebhookUrlAsync('https://8.8.8.8/webhook', {
        dnsRebindingProtection: true,
      });
      expect(result.valid).toBe(true);
      expect(result.resolvedIp).toBe('8.8.8.8');
    });

    it('should skip DNS resolution for allowed hosts', async () => {
      const result = await validateWebhookUrlAsync('https://localhost/webhook', {
        dnsRebindingProtection: true,
        allowedHosts: ['localhost'],
      });
      expect(result.valid).toBe(true);
      expect(result.url?.host).toBe('localhost');
    });

    it('should populate resolvedIp when DNS rebinding protection passes (IP literal path)', async () => {
      // Literal-IP input bypasses DNS — resolvedIp is the literal itself.
      // This is the deterministic path we can assert against in unit tests.
      const result = await validateWebhookUrlAsync('https://8.8.8.8/webhook', {
        dnsRebindingProtection: true,
      });
      expect(result.valid).toBe(true);
      expect(result.resolvedIp).toBe('8.8.8.8');
      expect(result.url?.host).toBe('8.8.8.8');
    });
  });

  describe('abortableResolve (CWE-400 — DNS lookup actually cancels on timeout)', () => {
    it('should reject when the abort signal fires before the resolver settles', async () => {
      const controller = new AbortController();
      // A resolver that hangs forever — simulates a slow/unresponsive DNS server.
      const hanging = () => new Promise<string[]>(() => {});
      const racing = _abortableResolveForTest(hanging, controller.signal);
      // Fire abort on next tick.
      setTimeout(() => controller.abort(), 5);
      await expect(racing).rejects.toThrow(/aborted/);
    });

    it('should reject immediately if the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = () => Promise.resolve(['1.2.3.4']);
      await expect(_abortableResolveForTest(fn, controller.signal)).rejects.toThrow(/pre-abort/);
    });

    it('should pass through the resolved value when no abort happens', async () => {
      const controller = new AbortController();
      const fn = () => Promise.resolve(['8.8.8.8', '8.8.4.4']);
      await expect(_abortableResolveForTest(fn, controller.signal)).resolves.toEqual([
        '8.8.8.8',
        '8.8.4.4',
      ]);
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
