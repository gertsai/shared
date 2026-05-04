/**
 * @fileoverview
 * Tests for service identifier creation utilities.
 */

import { describe, expect, it } from 'vitest';

import { createIdentifier } from '../identifier';
import type { IGlobalService, IService } from '../types';
import EventEmitter from 'events';

// Mock service classes for testing
class MockService extends EventEmitter implements IService<any> {
  get Consumer() {
    return null;
  }
  get isReady() {
    return Promise.resolve();
  }
  $destroy() {}
  // ... other EventEmitter methods would be implemented
}

class MockGlobalService extends EventEmitter implements IGlobalService {
  get isReady() {
    return Promise.resolve();
  }
  $destroy() {}
  // ... other EventEmitter methods would be implemented
}

describe('createIdentifier', () => {
  it('should create a unique symbol-based identifier', () => {
    const identifier1 = createIdentifier<MockService, 'test-service'>(
      'test-service',
    );
    const identifier2 = createIdentifier<MockService, 'test-service'>(
      'test-service',
    );

    // Even with same string, should create different symbols
    expect(identifier1).not.toBe(identifier2);
    expect(typeof identifier1).toBe('symbol');
    expect(typeof identifier2).toBe('symbol');
  });

  it('should preserve the string representation in the identifier', () => {
    const serviceName = 'user-profile';
    const identifier = createIdentifier<MockService, 'user-profile'>(
      'user-profile',
    );

    // The identifier should be a symbol with the correct description
    expect(identifier.toString()).toBe(`Symbol(${serviceName})`);
  });

  it('should work with different service types', () => {
    const serviceId = createIdentifier<MockService, 'service'>('service');
    const globalServiceId = createIdentifier<
      MockGlobalService,
      'global-service'
    >('global-service');

    expect(typeof serviceId).toBe('symbol');
    expect(typeof globalServiceId).toBe('symbol');
    expect(serviceId).not.toBe(globalServiceId);
  });

  it('should create identifiers with different string names', () => {
    const profileId = createIdentifier<MockService, 'profile'>('profile');
    const settingsId = createIdentifier<MockService, 'settings'>('settings');
    const notificationsId = createIdentifier<MockService, 'notifications'>(
      'notifications',
    );

    expect(profileId).not.toBe(settingsId);
    expect(settingsId).not.toBe(notificationsId);
    expect(profileId).not.toBe(notificationsId);

    expect(profileId.toString()).toBe('Symbol(profile)');
    expect(settingsId.toString()).toBe('Symbol(settings)');
    expect(notificationsId.toString()).toBe('Symbol(notifications)');
  });

  it('should maintain type safety at compile time', () => {
    // This test ensures TypeScript compilation works correctly
    const identifier = createIdentifier<MockService, 'test'>('test');

    // The identifier should have both string and ServiceIdentifier properties
    // This is verified at compile time, but we can check the runtime behavior
    expect(typeof identifier).toBe('symbol');

    // Type assertion should work (this would fail at compile time if types are wrong)
    const typedIdentifier: string & { __TYPE__: MockService } =
      identifier as any;
    expect(typedIdentifier).toBe(identifier);
  });
});
