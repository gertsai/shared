/**
 * Type definitions specifically for testing
 * These help create type-safe mocks and test fixtures
 */

import type { Redis } from 'ioredis';
import type { GatewayResponse, IncomingRequest } from 'moleculer-web';
import type { Mock } from 'vitest';

import type { RLRRedis, Store } from './types';

/**
 * Partial mock types for testing
 */
export type MockIncomingRequest = Partial<IncomingRequest> & {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export type MockGatewayResponse = Partial<GatewayResponse> & {
  headersSent?: boolean;
  setHeader?:
    | Mock<(name: string, value: string | number) => GatewayResponse>
    | ((name: string, value: string | number) => GatewayResponse);
};

export type MockRedis = Partial<Redis>;

export type MockRLRRedis = Partial<RLRRedis> & {
  defineCommand?: Mock;
  incrementSW?: Mock;
  gcraCheck?: Mock;
};

export type MockStore = Partial<Store> & {
  config?: { prefix?: string };
  generateSWKey?: Mock<(ip: string) => string>;
  getKey?: Mock<(ip: string, suffix?: string) => string>;
};

/**
 * Type guards for safer type assertions
 */
export function isIncomingRequest(value: unknown): value is IncomingRequest {
  return typeof value === 'object' && value !== null && 'method' in value && 'url' in value;
}

export function isGatewayResponse(value: unknown): value is GatewayResponse {
  return (
    typeof value === 'object' && value !== null && 'setHeader' in value && 'headersSent' in value
  );
}

/**
 * Factory functions for creating test mocks
 */
export function createMockRequest(overrides?: MockIncomingRequest): IncomingRequest {
  const mock: MockIncomingRequest = {
    method: 'GET',
    url: '',
    originalUrl: '',
    headers: {},
    ...overrides,
  };
  return mock as IncomingRequest;
}

export function createMockResponse(overrides?: MockGatewayResponse): GatewayResponse {
  // We need to use 'as unknown as' here because we're creating a partial mock
  // that doesn't implement all methods of GatewayResponse.
  // This is acceptable in test code where we only need specific methods.
  const baseMock = {
    headersSent: false,
    setHeader: () => {},
    end: () => {},
    write: () => true,
    writeHead: () => {},
    statusCode: 200,
    statusMessage: '',
  };

  const mock = {
    ...baseMock,
    ...overrides,
  };

  // Use 'as unknown as' only at the final cast
  return mock as unknown as GatewayResponse;
}

export function createMockRedis(overrides?: MockRedis): Redis {
  const mock = {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    defineCommand: () => {},
    call: () => Promise.resolve(),
    ...overrides,
  } satisfies Partial<Redis>;

  return mock as unknown as Redis;
}

export function createMockRLRRedis(overrides?: MockRLRRedis): RLRRedis {
  const mock = {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    defineCommand: () => {},
    call: () => Promise.resolve(),
    incrementSW: () => Promise.resolve([0, 0, 0]),
    gcraCheck: () => Promise.resolve([0, 0, 0]),
    ...overrides,
  } satisfies Partial<RLRRedis>;

  return mock as unknown as RLRRedis;
}

export function createMockStore(overrides?: MockStore): Store {
  const mock = {
    config: {
      limit: 100,
      timeFrame: 60000,
      store: () => ({}) as unknown as Redis,
      ...overrides?.config,
    },
    generateSWKey: (ip: string) => `rlr:sw:${ip}`,
    getKey: (ip: string, suffix?: string) => `rlr:${ip}${suffix || ''}`,
    incrementFW: () => Promise.resolve({ totalHits: 0, remainingHits: 100, expiryTime: 60000 }),
    incrementSW: () => Promise.resolve({ totalHits: 0, remainingHits: 100, expiryTime: 60000 }),
    decrement: () => Promise.resolve(),
    resetKey: () => Promise.resolve(),
    loadIncrementFWScript: () => Promise.resolve('sha'),
    middleware: () => Promise.resolve(),
    ...overrides,
  } satisfies Partial<Store>;

  return mock as unknown as Store;
}
