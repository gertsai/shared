/**
 * Regression tests for EVID-059 H-5 — `$switchOperator` unauthenticated
 * privilege swap on `GraphRAGSessionContext`.
 *
 * The method has been removed (Option A — 0 external consumers). This test
 * pins that removal so a re-introduction without auth/tenant gating would
 * break CI immediately.
 */
import { describe, expect, it } from 'vitest';

import { GraphRAGSessionContext } from '../session-context';
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
