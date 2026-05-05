// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  MissingTenantIdError,
  asTenantId,
  getTenantIdOptional,
  getTenantIdStrict,
  type TenantBearingContext,
} from './index';

describe('@gertsai/tenant — root primitives', () => {
  describe('getTenantIdStrict', () => {
    it('throws MissingTenantIdError when meta is undefined', () => {
      const ctx: TenantBearingContext = {};
      expect(() => getTenantIdStrict(ctx)).toThrow(MissingTenantIdError);
    });

    it('throws MissingTenantIdError when tenantId is undefined', () => {
      const ctx: TenantBearingContext = { meta: {} };
      expect(() => getTenantIdStrict(ctx)).toThrow(MissingTenantIdError);
    });

    it('throws MissingTenantIdError when tenantId is empty string', () => {
      const ctx: TenantBearingContext = { meta: { tenantId: '' } };
      expect(() => getTenantIdStrict(ctx)).toThrow(MissingTenantIdError);
    });

    it('returns the branded tenant id when meta.tenantId is a non-empty string', () => {
      const ctx: TenantBearingContext = { meta: { tenantId: 'acme' } };
      const tid = getTenantIdStrict(ctx);
      // Brand check — value should equal source string at runtime.
      expect(tid).toBe('acme');
    });

    it('throws MissingTenantIdError when ctx itself is null/undefined-ish', () => {
      // Callers may pass through partial frames; we still must not crash with
      // a TypeError — only MissingTenantIdError.
      expect(() => getTenantIdStrict(undefined as unknown as TenantBearingContext)).toThrow(
        MissingTenantIdError,
      );
    });
  });

  describe('getTenantIdOptional', () => {
    it('returns undefined when meta is missing', () => {
      expect(getTenantIdOptional({})).toBeUndefined();
    });

    it('returns undefined when tenantId is empty', () => {
      expect(getTenantIdOptional({ meta: { tenantId: '' } })).toBeUndefined();
    });

    it('returns the branded id when present', () => {
      const tid = getTenantIdOptional({ meta: { tenantId: 'tenant-42' } });
      expect(tid).toBe('tenant-42');
    });
  });

  describe('asTenantId', () => {
    it('rejects empty string with TypeError', () => {
      expect(() => asTenantId('')).toThrow(TypeError);
    });

    it('rejects non-string input with TypeError', () => {
      expect(() => asTenantId(undefined as unknown as string)).toThrow(TypeError);
    });

    it('returns the branded id for non-empty strings', () => {
      const tid = asTenantId('xyz');
      expect(tid).toBe('xyz');
    });
  });

  describe('MissingTenantIdError', () => {
    it('is an Error subclass with stable name', () => {
      const err = new MissingTenantIdError();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('MissingTenantIdError');
      expect(err.message).toMatch(/tenant/i);
    });
  });
});
