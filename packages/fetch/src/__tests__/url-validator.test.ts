/**
 * Tests for URL validation to prevent SSRF attacks.
 *
 * @module __tests__/url-validator.test
 */

import { describe, it, expect } from 'vitest';

import {
  validateUrl,
  assertSafeUrl,
  createUrlValidator,
  type UrlValidatorConfig,
} from '../lib/url-validator';

describe('validateUrl', () => {
  describe('valid public URLs', () => {
    const validUrls = [
      'https://api.example.com/data',
      'https://example.com:8080/path',
      'http://subdomain.example.com/api/v1',
      'https://1.2.3.4/path', // Public IP
      'https://api.github.com',
    ];

    it.each(validUrls)('should accept public URL: %s', (url) => {
      const result = validateUrl(url);
      expect(result.valid).toBe(true);
      expect(result.url).toBeDefined();
    });
  });

  describe('SSRF: localhost blocking', () => {
    const localhostUrls = [
      'http://localhost/admin',
      'http://localhost:6379', // Redis
      'http://localhost:5432', // PostgreSQL
      'http://127.0.0.1/internal',
      'http://127.0.0.1:9200', // Elasticsearch
      'http://127.0.0.255/path',
      'http://localhost.localdomain/api',
      'http://sub.localhost/path',
    ];

    it.each(localhostUrls)('should block localhost URL: %s', (url) => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/localhost|loopback/i);
    });

    it('should allow localhost when explicitly enabled', () => {
      const result = validateUrl('http://localhost:3000', { allowLocalhost: true });
      expect(result.valid).toBe(true);
    });
  });

  describe('SSRF: private network blocking', () => {
    const privateUrls = [
      // 10.0.0.0/8
      'http://10.0.0.1/internal',
      'http://10.255.255.255/path',
      // 172.16.0.0/12
      'http://172.16.0.1/admin',
      'http://172.31.255.255/api',
      // 192.168.0.0/16
      'http://192.168.1.1/router',
      'http://192.168.255.255/path',
    ];

    it.each(privateUrls)('should block private network URL: %s', (url) => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private network/i);
    });

    it('should allow private networks when explicitly enabled', () => {
      const result = validateUrl('http://192.168.1.1/api', { allowPrivateNetworks: true });
      expect(result.valid).toBe(true);
    });
  });

  describe('SSRF: cloud metadata blocking', () => {
    const metadataUrls = [
      // AWS metadata
      'http://169.254.169.254/latest/meta-data',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials',
      // Same IP different path
      'http://169.254.169.254/',
    ];

    it.each(metadataUrls)('should block cloud metadata URL: %s', (url) => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cloud metadata|169\.254\.169\.254/i);
    });

    it('should allow cloud metadata when explicitly enabled (dangerous!)', () => {
      const result = validateUrl('http://169.254.169.254/latest', {
        allowCloudMetadata: true,
        allowLinkLocal: true,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('SSRF: link-local blocking', () => {
    const linkLocalUrls = [
      'http://169.254.0.1/path',
      'http://169.254.255.254/api',
    ];

    it.each(linkLocalUrls)('should block link-local URL: %s', (url) => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/link-local/i);
    });
  });

  describe('SSRF: IPv6 blocking', () => {
    it('should block IPv6 loopback', () => {
      const result = validateUrl('http://[::1]/path');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/IPv6 loopback/i);
    });

    it('should block IPv6 link-local', () => {
      const result = validateUrl('http://[fe80::1]/path');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/IPv6 link-local/i);
    });

    it('should block IPv6 private (ULA)', () => {
      const result = validateUrl('http://[fd00::1]/path');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/IPv6 private/i);
    });
  });

  describe('protocol validation', () => {
    it('should block file:// protocol', () => {
      const result = validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/protocol.*not allowed/i);
    });

    it('should block ftp:// protocol', () => {
      const result = validateUrl('ftp://internal.server/files');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/protocol.*not allowed/i);
    });

    it('should block javascript: protocol', () => {
      const result = validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
    });

    it('should allow custom protocols when configured', () => {
      const result = validateUrl('ftp://ftp.example.com/file', {
        allowedProtocols: ['ftp:'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('hostname allowlist/blocklist', () => {
    it('should accept URL when hostname is in allowlist', () => {
      const result = validateUrl('https://api.example.com/data', {
        allowedHostnames: ['api.example.com', 'cdn.example.com'],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject URL when hostname is not in allowlist', () => {
      const result = validateUrl('https://evil.com/data', {
        allowedHostnames: ['api.example.com'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not in allowlist/i);
    });

    it('should reject URL when hostname is in blocklist', () => {
      const result = validateUrl('https://blocked.example.com/api', {
        blockedHostnames: ['blocked.example.com', 'spam.com'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/blocked/i);
    });
  });

  describe('edge cases', () => {
    it('should reject invalid URL format', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid url/i);
    });

    it('should reject URL exceeding max length', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(3000);
      const result = validateUrl(longUrl, { maxUrlLength: 2048 });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/exceeds maximum length/i);
    });

    it('should reject 0.0.0.0', () => {
      const result = validateUrl('http://0.0.0.0/path');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/0\.0\.0\.0/i);
    });

    it('should reject broadcast address', () => {
      const result = validateUrl('http://255.255.255.255/path');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/broadcast/i);
    });
  });
});

describe('assertSafeUrl', () => {
  it('should return URL object for valid URLs', () => {
    const url = assertSafeUrl('https://api.example.com/data');
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('api.example.com');
  });

  it('should throw for SSRF attempts', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest')).toThrow(/SSRF blocked/);
    expect(() => assertSafeUrl('http://localhost:6379')).toThrow(/SSRF blocked/);
    expect(() => assertSafeUrl('http://10.0.0.1/internal')).toThrow(/SSRF blocked/);
  });
});

describe('createUrlValidator', () => {
  it('should create validator with preset config', () => {
    const validator = createUrlValidator({
      allowedHostnames: ['api.internal.local', 'cache.internal.local'],
      allowPrivateNetworks: true,
    });

    // Should work with allowlist
    const result1 = validator.validate('http://api.internal.local/health');
    expect(result1.valid).toBe(true);

    // Should reject non-allowlisted
    const result2 = validator.validate('http://evil.com');
    expect(result2.valid).toBe(false);
  });

  it('should allow config overrides per call', () => {
    const validator = createUrlValidator({ allowLocalhost: false });

    // Default: blocked
    expect(validator.validate('http://localhost').valid).toBe(false);

    // Override: allowed
    expect(validator.validate('http://localhost', { allowLocalhost: true }).valid).toBe(true);
  });
});
