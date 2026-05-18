/**
 * Regression tests for EVID-059 H-5 — `$switchOperator` unauthenticated
 * privilege swap on `GraphRAGSessionContext`.
 *
 * The method has been removed (Option A — 0 external consumers). This test
 * pins that removal so a re-introduction without auth/tenant gating would
 * break CI immediately.
 *
 * Also includes EVID-059 H-4 regression tests for `updateSettings` —
 * verifying the method no longer mutates the existing settings object
 * in place via `Object.assign`.
 */
import { describe, expect, it } from 'vitest';

import { GraphRAGSessionContext } from '../session-context';
import type { GraphRAGSettings } from '../types';
import { UserType } from '../types';

describe('GraphRAGSessionContext — H-5 $switchOperator removal', () => {
  it('does not expose $switchOperator on the instance', () => {
    const session = new GraphRAGSessionContext({
      tenantId: 'tenant-A',
      operator: { id: 'op-1', type: UserType.USER, roles: [] },
      clientPlatform: 'web',
    });

    // The method must NOT be callable — neither as own property nor via
    // the prototype chain — to prevent unauthenticated privilege swap.
    expect(
      (session as unknown as { $switchOperator?: unknown }).$switchOperator,
    ).toBeUndefined();
    expect('$switchOperator' in session).toBe(false);

    session.$destroy();
  });

  it('does not declare $switchOperator on the prototype', () => {
    const proto = GraphRAGSessionContext.prototype as unknown as Record<string, unknown>;
    expect(proto.$switchOperator).toBeUndefined();
  });

  it('operator identity remains immutable through the public surface', () => {
    const session = new GraphRAGSessionContext({
      tenantId: 'tenant-A',
      operator: { id: 'op-1', type: UserType.USER, roles: [] },
      clientPlatform: 'web',
    });

    // No public method should allow swapping operator.id or operator.type.
    // The session-context only exposes `operator` as Readonly<Operator>.
    expect(session.operator.id).toBe('op-1');
    expect(session.operator.type).toBe(UserType.USER);

    session.$destroy();
  });
});

describe('GraphRAGSessionContext — H-4 updateSettings immutability', () => {
  it('does NOT mutate a previously captured graphRagSettings reference', () => {
    const session = new GraphRAGSessionContext({
      tenantId: 'tenant-A',
      operator: { id: 'op-1', type: UserType.USER, roles: [] },
      clientPlatform: 'web',
      graphRagSettings: { maxHops: 2, topK: 20 },
    });

    const snapshot = session.graphRagSettings;
    const snapshotMaxHops = snapshot.maxHops;
    const snapshotTopK = snapshot.topK;

    session.updateSettings({ maxHops: 99, topK: 999 });

    // Captured snapshot must be unchanged — H-4 closes the in-place mutation.
    expect(snapshot.maxHops).toBe(snapshotMaxHops);
    expect(snapshot.topK).toBe(snapshotTopK);

    // New getter call reflects the updated values.
    expect(session.graphRagSettings.maxHops).toBe(99);
    expect(session.graphRagSettings.topK).toBe(999);

    // And: the new and old objects are distinct references.
    expect(session.graphRagSettings).not.toBe(snapshot);

    session.$destroy();
  });

  it('returns a frozen object that throws on direct mutation in strict mode', () => {
    const session = new GraphRAGSessionContext({
      tenantId: 'tenant-A',
      operator: { id: 'op-1', type: UserType.USER, roles: [] },
      clientPlatform: 'web',
    });

    const settings = session.graphRagSettings;
    expect(Object.isFrozen(settings)).toBe(true);

    // Direct write in strict mode (ESM modules are strict by default) throws.
    expect(() => {
      (settings as GraphRAGSettings).maxHops = 999;
    }).toThrow(TypeError);

    session.$destroy();
  });
});
