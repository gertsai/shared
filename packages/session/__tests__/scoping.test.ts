// SPDX-License-Identifier: Apache-2.0
//
// Sprint 3.6 Wave 5 Phase 1 — additive multi-tenant scoping for Session
// (W-3-6-21 SUPERSEDED, ADR-006 Decision C / I-16, I-17 / Amendment 1.2.1, 1.2.3).
//
// Per Amendment 1.5, this file is a split from Session.test.ts: existing
// suites stay untouched, scoping coverage lives here.

import { describe, expect, it, vi } from 'vitest';

import { Session } from '../src/Session';
import type { AbstractDialog, SessionOpts } from '../src/types';
// Tests `instanceof`-check the same module Session.ts imports (workspace symlink resolves identity).
import { UnauthorizedError, ValidationError } from '@gertsai/errors';

const makeDialog = (): AbstractDialog => ({
  confirm: vi.fn().mockResolvedValue(true),
  alert: vi.fn(),
  error: vi.fn(),
});

const makeOpts = (overrides: Partial<SessionOpts> = {}): SessionOpts => ({
  operatorUuid: 'op-1',
  operatorType: 'web',
  tokenGetter: vi.fn().mockResolvedValue('test-token'),
  dialog: makeDialog(),
  clientPlatform: 'web',
  clientVersion: '1.0.0',
  ...overrides,
});

describe('Session scoping — getters return undefined when not set', () => {
  it('all 3 scoping getters return undefined when fields omitted', () => {
    const session = new Session(makeOpts());
    expect(session.tenantId).toBeUndefined();
    expect(session.projectId).toBeUndefined();
    expect(session.spaceId).toBeUndefined();
  });

  it('returns undefined (NOT null) — Amendment 1.2.1 contract', () => {
    const session = new Session(makeOpts());
    expect(session.tenantId).not.toBeNull();
    expect(session.projectId).not.toBeNull();
    expect(session.spaceId).not.toBeNull();
    // Strict undefined (not null, not empty string).
    expect(typeof session.tenantId).toBe('undefined');
  });
});

describe('Session scoping — getters return values when set', () => {
  it('exposes all 3 fields populated at construction', () => {
    const session = new Session(
      makeOpts({
        tenantId: 'tenant-acme',
        projectId: 'proj-42',
        spaceId: 'space-q1',
      }),
    );
    expect(session.tenantId).toBe('tenant-acme');
    expect(session.projectId).toBe('proj-42');
    expect(session.spaceId).toBe('space-q1');
  });

  it('flat tags — partial scope is valid (ADR-006 I-17)', () => {
    // Set tenantId without projectId/spaceId.
    const onlyTenant = new Session(makeOpts({ tenantId: 'tenant-only' }));
    expect(onlyTenant.tenantId).toBe('tenant-only');
    expect(onlyTenant.projectId).toBeUndefined();
    expect(onlyTenant.spaceId).toBeUndefined();

    // Orphan space (no project, no tenant) — also valid per I-17.
    const orphanSpace = new Session(makeOpts({ spaceId: 'system-space' }));
    expect(orphanSpace.spaceId).toBe('system-space');
    expect(orphanSpace.projectId).toBeUndefined();
    expect(orphanSpace.tenantId).toBeUndefined();
  });
});

describe('Session.getTenantStrict — auth boundary (ADR-006 I-16)', () => {
  it('returns the value when tenantId is set', () => {
    const session = new Session(makeOpts({ tenantId: 'tenant-acme' }));
    expect(session.getTenantStrict()).toBe('tenant-acme');
  });

  it('throws UnauthorizedError when tenantId is missing', () => {
    const session = new Session(makeOpts());
    expect(() => session.getTenantStrict()).toThrow(UnauthorizedError);
  });

  it('thrown error carries operator uuid in details', () => {
    const session = new Session(makeOpts({ operatorUuid: 'op-traceable' }));
    try {
      session.getTenantStrict();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      const e = err as UnauthorizedError;
      // UnauthorizedError typed details = { reason?: string } per @gertsai/errors.
      // Operator UUID is encoded into reason string (Phase B swap of stub→real).
      expect(e.details).toMatchObject({
        reason: expect.stringContaining('op-traceable'),
      });
      // Multi-tenancy is an authentication failure — NOT validation.
      expect(e).not.toBeInstanceOf(ValidationError);
    }
  });
});

describe('Session.getProjectStrict — validation boundary (ADR-006 I-16)', () => {
  it('returns the value when projectId is set', () => {
    const session = new Session(makeOpts({ projectId: 'proj-x' }));
    expect(session.getProjectStrict()).toBe('proj-x');
  });

  it('throws ValidationError when projectId is missing (not UnauthorizedError)', () => {
    const session = new Session(makeOpts());
    expect(() => session.getProjectStrict()).toThrow(ValidationError);
    try {
      session.getProjectStrict();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      // Project absence is invalid input, NOT authentication failure.
      expect(err).not.toBeInstanceOf(UnauthorizedError);
      const e = err as ValidationError;
      expect(e.details).toMatchObject({
        field: 'projectId',
        constraint: 'required-on-strict-call',
      });
    }
  });
});

describe('Session.getSpaceStrict — validation boundary (ADR-006 I-16)', () => {
  it('returns the value when spaceId is set', () => {
    const session = new Session(makeOpts({ spaceId: 'space-q1' }));
    expect(session.getSpaceStrict()).toBe('space-q1');
  });

  it('throws ValidationError when spaceId is missing (not UnauthorizedError)', () => {
    const session = new Session(makeOpts());
    expect(() => session.getSpaceStrict()).toThrow(ValidationError);
    try {
      session.getSpaceStrict();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).not.toBeInstanceOf(UnauthorizedError);
      const e = err as ValidationError;
      expect(e.details).toMatchObject({
        field: 'spaceId',
        constraint: 'required-on-strict-call',
      });
    }
  });
});

describe('Session scoping — flat tags interplay (ADR-006 I-17)', () => {
  it('tenant set, project missing — getTenantStrict succeeds, getProjectStrict throws ValidationError', () => {
    const session = new Session(makeOpts({ tenantId: 'tenant-only' }));
    expect(session.getTenantStrict()).toBe('tenant-only');
    expect(() => session.getProjectStrict()).toThrow(ValidationError);
  });

  it('different errors per missing field — auth vs validation discriminator', () => {
    const session = new Session(makeOpts());
    let tenantErr: unknown;
    let projectErr: unknown;
    try {
      session.getTenantStrict();
    } catch (e) {
      tenantErr = e;
    }
    try {
      session.getProjectStrict();
    } catch (e) {
      projectErr = e;
    }
    expect(tenantErr).toBeInstanceOf(UnauthorizedError);
    expect(projectErr).toBeInstanceOf(ValidationError);
    // Cross-class mismatch confirms the I-16 split.
    expect(tenantErr).not.toBeInstanceOf(ValidationError);
    expect(projectErr).not.toBeInstanceOf(UnauthorizedError);
  });
});
