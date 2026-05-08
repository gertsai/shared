/**
 * Wave 6.3 / RFC-004 Edge 1.7 — multi-scope permission cache tests.
 *
 * Verifies the ADR-012 invariants on `getPermissionCache`/
 * `setPermissionCache`/`resetPermissionCache` after the
 * singleton-to-Map refactor.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  PermissionCache,
  getPermissionCache,
  setPermissionCache,
  resetPermissionCache,
} from '../cache/index.js';

beforeEach(() => {
  resetPermissionCache();
});

describe('Wave 6.3 — multi-scope permission cache (RFC-004 Edge 1.7)', () => {
  it('I-1 back-compat: no-arg getPermissionCache returns the same default-scope instance', () => {
    const a = getPermissionCache();
    const b = getPermissionCache();
    expect(a).toBe(b);
  });

  it('multi-scope: same scope → same cache instance', () => {
    const a = getPermissionCache(undefined, 'tenant-acme');
    const b = getPermissionCache(undefined, 'tenant-acme');
    expect(a).toBe(b);
  });

  it('multi-scope: different scopes → different cache instances', () => {
    const acme = getPermissionCache(undefined, 'tenant-acme');
    const bravo = getPermissionCache(undefined, 'tenant-bravo');
    expect(acme).not.toBe(bravo);
  });

  it('default scope is independent of named scopes', () => {
    const def = getPermissionCache();
    const named = getPermissionCache(undefined, 'tenant-acme');
    expect(def).not.toBe(named);
  });

  it('setPermissionCache(scope) replaces ONE scope only', () => {
    const acme = getPermissionCache(undefined, 'tenant-acme');
    const bravo = getPermissionCache(undefined, 'tenant-bravo');
    const replacement = new PermissionCache();
    setPermissionCache(replacement, 'tenant-acme');

    expect(getPermissionCache(undefined, 'tenant-acme')).toBe(replacement);
    expect(getPermissionCache(undefined, 'tenant-acme')).not.toBe(acme);
    expect(getPermissionCache(undefined, 'tenant-bravo')).toBe(bravo);
  });

  it('resetPermissionCache(scope) deletes ONE scope; others remain', () => {
    const acme = getPermissionCache(undefined, 'tenant-acme');
    const bravo = getPermissionCache(undefined, 'tenant-bravo');
    resetPermissionCache('tenant-acme');
    expect(getPermissionCache(undefined, 'tenant-acme')).not.toBe(acme); // re-created
    expect(getPermissionCache(undefined, 'tenant-bravo')).toBe(bravo); // untouched
  });

  it('resetPermissionCache() (no arg) clears ALL — back-compat (ADR-012 I-5)', () => {
    const def = getPermissionCache();
    const acme = getPermissionCache(undefined, 'tenant-acme');
    resetPermissionCache();
    expect(getPermissionCache()).not.toBe(def);
    expect(getPermissionCache(undefined, 'tenant-acme')).not.toBe(acme);
  });
});
