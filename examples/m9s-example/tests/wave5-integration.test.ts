// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 5 integration tests — m9s-example (Sprint 3.10 W-3-10-21).
 *
 * Exercises the canonical Wave 5 stack composition:
 *   - `@gertsai/tenant-resolver` HeaderStrategy + ChainTenantResolver
 *   - `@gertsai/runtime-context` RequestContext (sessionMiddleware-shape)
 *   - `@gertsai/session` Session
 *   - `@gertsai/session-guard` assertAuthenticated / assertSessionInTenant
 *
 * Use cases gain optional `session` + `expectedTenantId` inputs (additive,
 * per ADR-010 I-2 / I-3) — these tests cover the new branches without
 * touching the existing 16 regression tests.
 *
 * Three scenarios per Sprint 3.10 build instructions:
 *   1. Tenant resolved from `X-Tenant-ID` header → use case runs successfully
 *      with a session scoped to the resolved tenant.
 *   2. Missing `X-Tenant-ID` with a STRICT chain → resolver throws
 *      `UnauthorizedError`.
 *   3. Valid tenant + destroyed/unauthenticated session → use case rejects
 *      with `AuthenticationRequiredError` from session-guard.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ChainTenantResolver,
  HeaderStrategy,
} from '@gertsai/tenant-resolver';
import { RequestContext } from '@gertsai/runtime-context';
import { Session, type AbstractDialog } from '@gertsai/session';
import {
  AuthenticationRequiredError,
  TenantScopeViolationError,
} from '@gertsai/session-guard';
import { UnauthorizedError } from '@gertsai/errors';

import { IngestDocumentUseCase } from '../src/application/IngestDocumentUseCase';
import type { IDocumentStore } from '../src/domain/ports/IDocumentStore';
import type { IChunkStore } from '../src/domain/ports/IChunkStore';
import type { IEmbedder } from '../src/domain/ports/IEmbedder';
import type { IPermissionGate } from '../src/domain/ports/IPermissionGate';

const noopDialog: AbstractDialog = {
  confirm: async () => true,
  alert: () => {},
  error: () => {},
};

function makeSession(overrides: {
  tenantId?: string;
  operatorUuid?: string;
  destroyed?: boolean;
}): Session {
  const session = new Session({
    operatorUuid: overrides.operatorUuid ?? 'user-1',
    operatorType: 'web',
    tokenGetter: async () => 'tok',
    dialog: noopDialog,
    clientPlatform: 'web',
    clientVersion: '0.0.0-test',
    tenantId: overrides.tenantId,
  });
  if (overrides.destroyed === true) {
    session.$destroy();
  }
  return session;
}

function makeIngestDeps() {
  const docStore: IDocumentStore = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
  };
  const chunkStore: IChunkStore = {
    addChunks: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
  };
  const embedder: IEmbedder = {
    dimensions: 4,
    embed: vi.fn(async (texts: ReadonlyArray<string>) =>
      texts.map(() => [0.1, 0.2, 0.3, 0.4]),
    ),
  };
  const gate: IPermissionGate = {
    can: vi.fn().mockResolvedValue(true),
  };
  return { docStore, chunkStore, embedder, gate };
}

describe('Wave 5 integration — m9s-example (Sprint 3.10)', () => {
  it('resolves tenant from X-Tenant-ID header and runs use case scoped to that tenant', async () => {
    // Tenant resolution chain — same wiring as composition/wave5-middlewares.ts.
    const headerStrategy = new HeaderStrategy({
      headerName: 'X-Tenant-ID',
      // SECURITY: trustProxy: true requires a reverse proxy stripping inbound
      // X-Tenant-ID. In test fixtures we simulate the post-proxy state by
      // constructing the request directly. See README §Wave 5 stack reference.
      trustProxy: true,
    });
    const chain = new ChainTenantResolver([headerStrategy], { mode: 'strict' });

    const resolution = await chain.resolve({
      headers: { 'x-tenant-id': 'tenant-acme' },
    });
    expect(resolution).toEqual({
      tenantId: 'tenant-acme',
      strategyName: 'header',
    });

    // RequestContext composition mirrors what sessionMiddleware does
    // upstream of the use case at runtime.
    const ctx = new RequestContext({
      tenantId: resolution!.tenantId,
      session: makeSession({ tenantId: 'tenant-acme', operatorUuid: 'u1' }),
    });
    ctx.$freeze();
    expect(ctx.frozen).toBe(true);
    expect(ctx.tenantId).toBe('tenant-acme');

    // Use case runs with session + expectedTenantId — both assertions pass.
    const deps = makeIngestDeps();
    const useCase = new IngestDocumentUseCase(deps);

    const result = await useCase.execute({
      userId: ctx.session.operatorUuid,
      docId: 'd1',
      text: 'Hello world.',
      session: ctx.session,
      expectedTenantId: ctx.tenantId,
    });

    expect(result).toEqual({ docId: 'd1', chunkCount: 1 });
    expect(deps.docStore.save).toHaveBeenCalledTimes(1);
  });

  it('rejects requests missing X-Tenant-ID under a strict chain', async () => {
    const headerStrategy = new HeaderStrategy({
      headerName: 'X-Tenant-ID',
      trustProxy: true,
    });
    const chain = new ChainTenantResolver([headerStrategy], { mode: 'strict' });

    await expect(
      chain.resolve({ headers: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects use case with AuthenticationRequiredError when session is destroyed', async () => {
    const destroyed = makeSession({
      tenantId: 'tenant-acme',
      destroyed: true,
    });

    const deps = makeIngestDeps();
    const useCase = new IngestDocumentUseCase(deps);

    await expect(
      useCase.execute({
        userId: 'u1',
        docId: 'd1',
        text: 'hello.',
        session: destroyed,
        expectedTenantId: 'tenant-acme',
      }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    expect(deps.gate.can).not.toHaveBeenCalled();
    expect(deps.docStore.save).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant access with TenantScopeViolationError', async () => {
    const session = makeSession({
      tenantId: 'tenant-foo',
      operatorUuid: 'u1',
    });

    const deps = makeIngestDeps();
    const useCase = new IngestDocumentUseCase(deps);

    await expect(
      useCase.execute({
        userId: 'u1',
        docId: 'd1',
        text: 'hello.',
        session,
        expectedTenantId: 'tenant-bar',
      }),
    ).rejects.toBeInstanceOf(TenantScopeViolationError);

    expect(deps.gate.can).not.toHaveBeenCalled();
    expect(deps.docStore.save).not.toHaveBeenCalled();
  });
});
