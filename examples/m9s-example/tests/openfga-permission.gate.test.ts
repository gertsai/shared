// SPDX-License-Identifier: Apache-2.0
/**
 * Verifies the fail-closed semantic from ADR-011 §A2.4 is preserved — a
 * `can()` call against an unreachable endpoint still returns `false`
 * (no rethrow, no fail-OPEN).
 *
 * No live OpenFGA needed — uses an unreachable endpoint
 * (`http://127.0.0.1:1`) to provoke the catch path.
 */
import { describe, it, expect } from 'vitest';

import {
  OpenFgaPermissionGate,
  decodeResource,
} from '../src/infrastructure/openfga-permission.gate';

describe('decodeResource', () => {
  it("collapses '*' to defaultResourceType + 'global' id", () => {
    expect(decodeResource('*', 'tenant')).toEqual({
      resourceType: 'tenant',
      resourceId: 'global',
    });
  });

  it("parses '<type>:<id>' shape", () => {
    expect(decodeResource('document:doc-1', 'tenant')).toEqual({
      resourceType: 'document',
      resourceId: 'doc-1',
    });
  });

  it('falls back to defaultResourceType for bare ids', () => {
    expect(decodeResource('proj-42', 'project')).toEqual({
      resourceType: 'project',
      resourceId: 'proj-42',
    });
  });
});

describe('OpenFgaPermissionGate — fail-closed behavior', () => {
  it('fail-closed semantic preserved: can() returns false when OpenFGA is unreachable', async () => {
    // Reset singleton so this test isn't influenced by other suites.
    const mod = await import('@gertsai/auth-openfga');
    mod.resetFgaClient();
    mod.resetPermissionCache();
    try {
      const gate = new OpenFgaPermissionGate({
        logger: { warn: () => {}, error: () => {} },
        client: {
          apiUrl: 'http://127.0.0.1:1',
          storeId: 'unused',
          apiToken: 'secret-bearer-123',
        },
      });
      const allowed = await gate.can('user:123', 'search', 'document:doc-1');
      expect(allowed).toBe(false);
    } finally {
      mod.resetFgaClient();
      mod.resetPermissionCache();
    }
  }, 15_000);
});

