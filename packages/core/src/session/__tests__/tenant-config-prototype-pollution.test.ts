/**
 * Regression tests for EVID-059 H-6 — `mergeTenantConfigWithDefaults` and
 * `applyTenantConfigUpdate` previously deep-spread caller-controlled config
 * with no key sanitisation. Input produced by `JSON.parse` of attacker text
 * can carry own `__proto__` / `constructor` / `prototype` keys that, when
 * spread, leak as own properties onto the merged result.
 *
 * The fix routes every nested spread through `safeSpread`, which filters the
 * three forbidden keys.
 */
import { describe, expect, it } from 'vitest';

import {
  applyTenantConfigUpdate,
  mergeTenantConfigWithDefaults,
  type TenantConfig,
  type TenantConfigCreate,
} from '../tenant-config';

function baseCreateConfig(): TenantConfigCreate {
  return {
    tenantId: 'tenant-A',
    llm: { provider: 'openai', model: 'gpt-4o-mini' },
    embedding: { provider: 'openai', model: 'text-embedding-3-small' },
  };
}

/**
 * Build a config object that carries an own `__proto__` key via `JSON.parse`.
 * V8 / SpiderMonkey both preserve `__proto__` as a real own property when
 * the JSON text contains it explicitly — this is the prototype-pollution
 * attack vector we must defend against.
 */
function buildTaintedConfigJson(): TenantConfigCreate {
  const raw = JSON.stringify({
    tenantId: 'tenant-A',
    llm: { provider: 'openai', model: 'gpt-4o-mini' },
    embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    features: { auditLogging: true },
  });
  // Inject `__proto__` as a literal JSON key.
  const tainted = raw.replace(
    '"features":',
    '"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"features":',
  );
  return JSON.parse(tainted) as TenantConfigCreate;
}

describe('EVID-059 H-6 — mergeTenantConfigWithDefaults proto-pollution guard', () => {
  it('does not carry own `__proto__` key from tainted input to merged result', () => {
    const tainted = buildTaintedConfigJson();
    // Sanity: the input HAS own `__proto__` (the attack vector exists).
    expect(Object.prototype.hasOwnProperty.call(tainted, '__proto__')).toBe(true);

    const merged = mergeTenantConfigWithDefaults(tainted);

    // The merged result must NOT carry the forbidden key as own.
    expect(Object.prototype.hasOwnProperty.call(merged, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged, 'prototype')).toBe(false);

    // Non-forbidden own data still propagates.
    expect(merged.tenantId).toBe('tenant-A');
    expect(merged.features?.auditLogging).toBe(true);

    // And — critical — Object.prototype must NOT have been polluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('strips `__proto__` from nested sections (graphRag) supplied by caller', () => {
    const base = baseCreateConfig();
    // Build a nested graphRag with an own `__proto__` key.
    const nestedJson = JSON.stringify({ maxHops: 3 }).replace(
      '"maxHops"',
      '"__proto__":{"evilNested":true},"maxHops"',
    );
    const nested = JSON.parse(nestedJson);
    const input = { ...base, graphRag: nested } as TenantConfigCreate;

    const merged = mergeTenantConfigWithDefaults(input);

    expect(merged.graphRag?.maxHops).toBe(3);
    expect(Object.prototype.hasOwnProperty.call(merged.graphRag ?? {}, '__proto__')).toBe(
      false,
    );
    expect(({} as Record<string, unknown>).evilNested).toBeUndefined();
  });
});

describe('EVID-059 H-6 — applyTenantConfigUpdate proto-pollution guard', () => {
  it('does not carry own `__proto__` key from tainted update to merged result', () => {
    const merged = mergeTenantConfigWithDefaults(baseCreateConfig());
    const existing: TenantConfig = merged;

    const taintedUpdateJson = JSON.stringify({
      tenantId: 'tenant-A',
      features: { auditLogging: false },
    }).replace(
      '"features":',
      '"__proto__":{"poisoned":true},"prototype":{"poisoned":true},"features":',
    );
    const taintedUpdate = JSON.parse(taintedUpdateJson);

    expect(Object.prototype.hasOwnProperty.call(taintedUpdate, '__proto__')).toBe(true);

    const updated = applyTenantConfigUpdate(existing, taintedUpdate);

    expect(Object.prototype.hasOwnProperty.call(updated, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updated, 'prototype')).toBe(false);
    expect(updated.features?.auditLogging).toBe(false);

    // Object.prototype untouched.
    expect(({} as Record<string, unknown>).poisoned).toBeUndefined();
  });

  it('strips `__proto__` from nested memory update', () => {
    const merged = mergeTenantConfigWithDefaults(baseCreateConfig());
    const taintedNestedJson = JSON.stringify({ enabled: true }).replace(
      '"enabled"',
      '"__proto__":{"nestedPoison":true},"enabled"',
    );
    const taintedMemory = JSON.parse(taintedNestedJson);

    const updated = applyTenantConfigUpdate(merged, {
      tenantId: 'tenant-A',
      memory: taintedMemory,
    });

    expect(updated.memory?.enabled).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(updated.memory ?? {}, '__proto__')).toBe(
      false,
    );
    expect(({} as Record<string, unknown>).nestedPoison).toBeUndefined();
  });
});
