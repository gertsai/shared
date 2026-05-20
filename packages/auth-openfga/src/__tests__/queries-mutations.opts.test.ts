// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 24 / PRD-061 FR-Y1 — closes EVID-078 H-1 (mid-tier audit).
 *
 * Asserts the 7 query/mutation entry points that previously hard-called
 * `getFgaClient()` now accept the `CheckPermissionOptions.client`
 * escape hatch and route to the explicit instance — preserving multi-
 * tenant isolation as documented for {@link checkPermission}.
 *
 * Strategy: build a partial `GertsFgaClient` stub with the 5 methods
 * exercised by the audited entry points (`batchCheck`, `listObjects`,
 * `listUsers`, `expand`, `check`, `writeTuples`, `deleteTuples`,
 * `write`) and pass it via `opts.client`. Each test verifies the stub
 * is hit instead of the default singleton.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { GertsFgaClient } from '../client.js';
import { resetFgaClient } from '../client.js';
import {
  batchCheckPermissions,
  listAccessibleResources,
  listUsersWithAccess,
  expandPermission,
  explainAccess,
} from '../queries/index.js';
import { writeTuples, deleteTuples, writeTransaction } from '../mutations/index.js';
import { resetDenyLedger } from '../deny/index.js';
import { resetPermissionCache } from '../cache/index.js';

/**
 * Minimal `GertsFgaClient` lookalike. We use the structural shape
 * because constructing a real `GertsFgaClient` requires SDK mocking
 * scaffolding that is not relevant here — what we want to verify is
 * that `opts.client` is used instead of `getFgaClient()`.
 */
function makeStubClient(): GertsFgaClient & {
  batchCheck: ReturnType<typeof vi.fn>;
  listObjects: ReturnType<typeof vi.fn>;
  listUsers: ReturnType<typeof vi.fn>;
  expand: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  writeTuples: ReturnType<typeof vi.fn>;
  deleteTuples: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  const stub = {
    batchCheck: vi.fn().mockResolvedValue([]),
    listObjects: vi.fn().mockResolvedValue([]),
    listUsers: vi.fn().mockResolvedValue([]),
    expand: vi.fn().mockResolvedValue({ type: 'leaf', users: [] }),
    check: vi.fn().mockResolvedValue({ allowed: true, resolution: 'direct' }),
    writeTuples: vi.fn().mockResolvedValue(undefined),
    deleteTuples: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  };
  // The functions only touch a typed subset of `GertsFgaClient` —
  // structural assignability allows the cast.
  return stub as unknown as GertsFgaClient & typeof stub;
}

beforeEach(() => {
  resetFgaClient();
  resetDenyLedger();
  resetPermissionCache();
});

describe('FR-Y1 — opts.client plumbing into 7 query/mutation entry points', () => {
  it('batchCheckPermissions: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    stub.batchCheck.mockResolvedValueOnce([
      { request: { userId: 'u1', relation: 'can_view', resourceType: 'project', resourceId: 'p1' }, allowed: true },
    ]);
    const out = await batchCheckPermissions(
      [{ userId: 'u1', relation: 'can_view', resourceType: 'project', resourceId: 'p1' }],
      { client: stub },
    );
    expect(stub.batchCheck).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
  });

  it('listAccessibleResources: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    stub.listObjects.mockResolvedValueOnce(['project:p1', 'project:p2']);
    const out = await listAccessibleResources('u1', 'can_view', 'project', { client: stub });
    expect(stub.listObjects).toHaveBeenCalledWith({
      userId: 'u1',
      relation: 'can_view',
      resourceType: 'project',
    });
    expect(out).toEqual(['p1', 'p2']);
  });

  it('listUsersWithAccess: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    stub.listUsers.mockResolvedValueOnce(['user:alice', 'user:bob']);
    const out = await listUsersWithAccess('project', 'p1', 'viewer', { client: stub });
    expect(stub.listUsers).toHaveBeenCalledWith({
      resourceType: 'project',
      resourceId: 'p1',
      relation: 'viewer',
    });
    expect(out).toEqual(['alice', 'bob']);
  });

  it('expandPermission: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    stub.expand.mockResolvedValueOnce({ type: 'leaf', users: ['user:alice'] });
    const out = await expandPermission(
      { relation: 'can_view', resourceType: 'project', resourceId: 'p1' },
      { client: stub },
    );
    expect(stub.expand).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ type: 'leaf', users: ['user:alice'] });
  });

  it('explainAccess: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    stub.check.mockResolvedValueOnce({ allowed: true, resolution: 'direct' });
    stub.expand.mockResolvedValueOnce({ type: 'leaf', users: ['user:alice'] });
    const out = await explainAccess(
      { userId: 'alice', relation: 'can_view', resourceType: 'project', resourceId: 'p1' },
      { client: stub },
    );
    expect(stub.check).toHaveBeenCalledTimes(1);
    expect(stub.expand).toHaveBeenCalledTimes(1);
    expect(out.allowed).toBe(true);
  });

  it('writeTuples: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    await writeTuples(
      [{ user: 'user:alice', relation: 'viewer', object: 'project:p1' }],
      { client: stub },
    );
    expect(stub.writeTuples).toHaveBeenCalledTimes(1);
  });

  it('deleteTuples: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    await deleteTuples(
      [{ user: 'user:alice', relation: 'viewer', object: 'project:p1' }],
      { client: stub },
    );
    expect(stub.deleteTuples).toHaveBeenCalledTimes(1);
  });

  it('writeTransaction: opts.client overrides default singleton', async () => {
    const stub = makeStubClient();
    await writeTransaction(
      {
        writes: [{ user: 'user:alice', relation: 'viewer', object: 'project:p1' }],
        deletes: [],
      },
      { client: stub },
    );
    expect(stub.write).toHaveBeenCalledTimes(1);
  });
});
