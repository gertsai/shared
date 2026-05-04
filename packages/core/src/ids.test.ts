/**
 * @gertsai/core - Branded ID Types Tests
 *
 * Tests for type-safe branded IDs to prevent ID mixups at compile time.
 *
 * @module @gertsai/core/ids.test
 */

import { describe, it, expect } from 'vitest';
import {
  Brand,
  Id,
  FlowId,
  ModuleId,
  ExecutionId,
  TenantId,
  UserId,
  AgentId,
  TaskId,
  SessionId,
  toId,
  createId,
  createTenantId,
  createUserId,
  createAgentId,
  createTaskId,
  createSessionId,
  createFlowId,
  createExecutionId,
  isTenantId,
  isUserId,
  isAgentId,
} from './ids';

// =============================================================================
// Type-level tests (compile-time safety)
// =============================================================================

describe('Branded IDs - Type Safety', () => {
  it('should create IDs with correct prefixes', () => {
    const tenantId = createTenantId();
    const userId = createUserId();
    const agentId = createAgentId();
    const taskId = createTaskId();
    const sessionId = createSessionId();
    const flowId = createFlowId();
    const executionId = createExecutionId();

    expect(tenantId).toMatch(/^tenant:/);
    expect(userId).toMatch(/^user:/);
    expect(agentId).toMatch(/^agent:/);
    expect(taskId).toMatch(/^task:/);
    expect(sessionId).toMatch(/^session:/);
    expect(flowId).toMatch(/^flow:/);
    expect(executionId).toMatch(/^execution:/);
  });

  it('should create IDs with custom values', () => {
    const tenantId = createTenantId('acme-corp');
    const userId = createUserId('john-doe');
    const agentId = createAgentId('analyzer-v1');

    expect(tenantId).toBe('tenant:acme-corp');
    expect(userId).toBe('user:john-doe');
    expect(agentId).toBe('agent:analyzer-v1');
  });

  it('should generate unique IDs when no value provided', () => {
    const id1 = createTenantId();
    const id2 = createTenantId();

    expect(id1).not.toBe(id2);
  });

  it('should allow ID to be used as string', () => {
    const tenantId = createTenantId('test');

    // Branded types are still strings at runtime
    expect(typeof tenantId).toBe('string');
    expect(tenantId.toUpperCase()).toBe('TENANT:TEST');
    expect(tenantId.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('ID Type Guards', () => {
  describe('isTenantId', () => {
    it('should return true for valid tenant IDs', () => {
      expect(isTenantId('tenant:acme')).toBe(true);
      expect(isTenantId('tenant:123')).toBe(true);
      expect(isTenantId('tenant:a-b-c')).toBe(true);
    });

    it('should return false for non-tenant IDs', () => {
      expect(isTenantId('user:john')).toBe(false);
      expect(isTenantId('agent:bot')).toBe(false);
      expect(isTenantId('random-string')).toBe(false);
      expect(isTenantId('')).toBe(false);
    });
  });

  describe('isUserId', () => {
    it('should return true for valid user IDs', () => {
      expect(isUserId('user:john')).toBe(true);
      expect(isUserId('user:123')).toBe(true);
    });

    it('should return false for non-user IDs', () => {
      expect(isUserId('tenant:acme')).toBe(false);
      expect(isUserId('agent:bot')).toBe(false);
    });
  });

  describe('isAgentId', () => {
    it('should return true for valid agent IDs', () => {
      expect(isAgentId('agent:bot')).toBe(true);
      expect(isAgentId('agent:analyzer-v1')).toBe(true);
    });

    it('should return false for non-agent IDs', () => {
      expect(isAgentId('tenant:acme')).toBe(false);
      expect(isAgentId('user:john')).toBe(false);
    });
  });
});

// =============================================================================
// Generic ID Functions
// =============================================================================

describe('Generic ID Functions', () => {
  describe('toId', () => {
    it('should convert string to branded ID', () => {
      const id = toId<'tenant'>('tenant:acme');
      expect(id).toBe('tenant:acme');
    });
  });

  describe('createId', () => {
    it('should create ID with prefix and value', () => {
      const id = createId('custom', 'value');
      expect(id).toBe('custom:value');
    });

    it('should create ID with random value when not provided', () => {
      const id = createId('custom');
      expect(id).toMatch(/^custom:/);
      expect(id.length).toBeGreaterThan('custom:'.length);
    });
  });
});

// =============================================================================
// Compile-Time Type Safety Demo
// =============================================================================

describe('Compile-Time Type Safety', () => {
  // These tests demonstrate the type safety at compile time
  // The actual runtime behavior is tested above

  it('should demonstrate branded types prevent accidental swapping', () => {
    const tenantId: TenantId = createTenantId('acme');
    const userId: UserId = createUserId('john');

    // At runtime these are just strings, but TypeScript prevents:
    // const wrongTenant: TenantId = userId; // TS Error!
    // const wrongUser: UserId = tenantId;   // TS Error!

    // This test passes at runtime but the type system prevents misuse
    expect(tenantId).toBeDefined();
    expect(userId).toBeDefined();
  });

  it('should allow type-safe function parameters', () => {
    // Example function that only accepts TenantId
    function getTenantData(id: TenantId): string {
      return `Data for ${id}`;
    }

    const tenantId = createTenantId('acme');
    const result = getTenantData(tenantId);

    expect(result).toBe('Data for tenant:acme');

    // This would be a compile error:
    // const userId = createUserId('john');
    // getTenantData(userId); // TS Error: Argument of type 'UserId' is not assignable to parameter of type 'TenantId'
  });

  it('should work with generics', () => {
    function processId<T extends Id<string>>(id: T): T {
      return id;
    }

    const tenantId = createTenantId('test');
    const result = processId(tenantId);

    expect(result).toBe(tenantId);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty string values', () => {
    const id = createTenantId('');
    expect(id).toBe('tenant:');
  });

  it('should handle special characters in values', () => {
    const id = createTenantId('acme/corp:2024');
    expect(id).toBe('tenant:acme/corp:2024');
  });

  it('should handle unicode in values', () => {
    const id = createTenantId('компания');
    expect(id).toBe('tenant:компания');
  });

  it('should handle very long values', () => {
    const longValue = 'a'.repeat(1000);
    const id = createTenantId(longValue);
    expect(id).toBe(`tenant:${longValue}`);
  });
});
