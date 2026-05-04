import { describe, expect, it, vi } from 'vitest';
import type { IncomingRequest } from 'moleculer-web';
import { validations } from './validations';
import type { Store } from './types';

describe('validations', () => {
  describe('ip validation', () => {
    it('accepts valid IPv4 addresses', () => {
      expect(() => validations.ip('192.168.1.1')).not.toThrow();
      expect(() => validations.ip('127.0.0.1')).not.toThrow();
      expect(() => validations.ip('0.0.0.0')).not.toThrow();
      expect(() => validations.ip('255.255.255.255')).not.toThrow();
    });

    it('accepts valid IPv6 addresses', () => {
      expect(() => validations.ip('::1')).not.toThrow();
      expect(() => validations.ip('2001:db8::1')).not.toThrow();
      expect(() => validations.ip('fe80::1')).not.toThrow();
    });

    it('throws on undefined IP', () => {
      expect(() => validations.ip(undefined)).toThrow('ERR_ERL_UNDEFINED_IP_ADDRESS');
    });

    it('throws on invalid IP addresses', () => {
      expect(() => validations.ip('not-an-ip')).toThrow('ERR_ERL_INVALID_IP_ADDRESS');
      expect(() => validations.ip('192.168.1.256')).toThrow('ERR_ERL_INVALID_IP_ADDRESS');
      expect(() => validations.ip('192.168.1.1:8080')).toThrow('ERR_ERL_INVALID_IP_ADDRESS');
      expect(() => validations.ip('localhost')).toThrow('ERR_ERL_INVALID_IP_ADDRESS');
    });
  });

  describe('xForwardedForHeader validation', () => {
    it('does not throw when X-Forwarded-For is not present', () => {
      const request = {
        headers: {},
        app: {
          get: vi.fn().mockReturnValue(false),
        },
      } as unknown as IncomingRequest;

      expect(() => validations.xForwardedForHeader(request)).not.toThrow();
    });

    it('does not throw when trust proxy is enabled', () => {
      const request = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
        app: {
          get: vi.fn().mockReturnValue(true),
        },
      } as unknown as IncomingRequest;

      expect(() => validations.xForwardedForHeader(request)).not.toThrow();
    });

    it('throws when X-Forwarded-For is present but trust proxy is false', () => {
      const request = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
        app: {
          get: vi.fn().mockReturnValue(false),
        },
      } as unknown as IncomingRequest;

      expect(() => validations.xForwardedForHeader(request)).toThrow(
        'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR',
      );
    });
  });

  describe('singleCount validation', () => {
    it('allows first increment for a key', () => {
      const request = {} as IncomingRequest;
      const store = {
        constructor: { name: 'TestStore' },
        config: { prefix: 'rlr:' },
      } as unknown as Store;

      expect(() => validations.singleCount(request, store, 'test-key')).not.toThrow();
    });

    it('allows different keys to be incremented', () => {
      const request = {} as IncomingRequest;
      const store = {
        constructor: { name: 'TestStore' },
        config: { prefix: 'rlr:' },
      } as unknown as Store;

      validations.singleCount(request, store, 'key1');
      expect(() => validations.singleCount(request, store, 'key2')).not.toThrow();
    });

    it('throws when same key is incremented twice', () => {
      const request = {} as IncomingRequest;
      const store = {
        constructor: { name: 'TestStore' },
        config: { prefix: 'rlr:' },
      } as unknown as Store;

      validations.singleCount(request, store, 'duplicate-key');
      // The actual error message from OrchestraError
      expect(() => validations.singleCount(request, store, 'duplicate-key')).toThrow(
        'Bad request: Invalid params',
      );
    });

    it('handles stores without prefix', () => {
      const request = {} as IncomingRequest;
      const store = {
        constructor: { name: 'TestStore' },
        config: {},
      } as unknown as Store;

      validations.singleCount(request, store, 'key');
      expect(() => validations.singleCount(request, store, 'key')).toThrow();
    });

    it('tracks keys separately per request', () => {
      const request1 = {} as IncomingRequest;
      const request2 = {} as IncomingRequest;
      const store = {
        constructor: { name: 'TestStore' },
        config: { prefix: 'rlr:' },
      } as unknown as Store;

      validations.singleCount(request1, store, 'shared-key');
      // Same key but different request should not throw
      expect(() => validations.singleCount(request2, store, 'shared-key')).not.toThrow();
    });
  });

  describe('limit validation', () => {
    it('does not throw for positive limits', () => {
      expect(() => validations.limit(1)).not.toThrow();
      expect(() => validations.limit(100)).not.toThrow();
      expect(() => validations.limit(999999)).not.toThrow();
    });

    it('throws warning for limit of 0', () => {
      expect(() => validations.limit(0)).toThrow('WRN_ERL_MAX_ZERO');
      expect(() => validations.limit(0)).toThrow(
        'Setting limit or max to 0 disables rate limiting',
      );
    });

    it('does not throw for negative limits (though they may be invalid)', () => {
      // The validation only checks for 0, not negative values
      expect(() => validations.limit(-1)).not.toThrow();
    });
  });
});
