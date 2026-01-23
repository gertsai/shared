import { describe, expect, it } from 'vitest';
import { RouteResolver } from './RouteResolver';
import { PathNormalizer } from './PathNormalizer';
import type { IncomingRequest, RouteType } from '../utils/types';
import { Methods } from '../utils/types';
import { createMockRequest } from '../utils/test-types';

const mockReq = (url: string, method: Methods = Methods.GET): IncomingRequest =>
  createMockRequest({
    method,
    url,
    originalUrl: url,
  });

describe('RouteResolver', () => {
  it('matches string patterns and extracts params', () => {
    const routes = [
      { path: '/users/:id', method: Methods.GET, limit: 10, timeFrame: 1000 },
    ] satisfies RouteType[];
    const resolver = new RouteResolver(routes, new PathNormalizer());

    const r = resolver.resolve(mockReq('/USERS/12345'));
    expect(r).not.toBeNull();
    expect(r?.route.limit).toBe(10);
    expect(r?.params.id).toBe('12345');
    expect(r?.bucketId.startsWith('get:/users')).toBe(true);
  });

  it('matches RegExp routes', () => {
    const routes = [
      {
        path: /^\/teams\/(?:[a-z0-9-]{6,})$/,
        method: Methods.GET,
        limit: 5,
        timeFrame: 500,
      },
    ] satisfies RouteType[];
    const resolver = new RouteResolver(routes, new PathNormalizer());
    const r = resolver.resolve(mockReq('/teams/a1b2c3d4'));
    expect(r).not.toBeNull();
    expect(r?.route.limit).toBe(5);
  });

  it('returns null if no match', () => {
    const routes = [
      { path: '/users/:id', method: Methods.GET, limit: 10, timeFrame: 1000 },
    ] satisfies RouteType[];
    const resolver = new RouteResolver(routes, new PathNormalizer());
    const r = resolver.resolve(mockReq('/projects/1'));
    expect(r).toBeNull();
  });

  describe('RegExp patterns (edge cases)', () => {
    it('matches UUID pattern in path', () => {
      const routes = [
        {
          path: /^\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          method: Methods.GET,
          limit: 10,
          timeFrame: 1000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      const r = resolver.resolve(mockReq('/users/550e8400-e29b-41d4-a716-446655440000'));
      expect(r).not.toBeNull();
      expect(r?.route.limit).toBe(10);
    });

    it('does not match non-UUID path', () => {
      const routes = [
        {
          path: /^\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          method: Methods.GET,
          limit: 10,
          timeFrame: 1000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      const r = resolver.resolve(mockReq('/users/12345'));
      expect(r).toBeNull();
    });

    it('matches complex nested pattern', () => {
      const routes = [
        {
          path: /^\/api\/v\d+\/organizations\/[^/]+\/teams\/[^/]+\/members$/,
          method: Methods.GET,
          limit: 5,
          timeFrame: 1000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      const r = resolver.resolve(mockReq('/api/v2/organizations/acme-corp/teams/dev-team/members'));
      expect(r).not.toBeNull();
    });

    it('respects method matching with RegExp', () => {
      const routes = [
        {
          path: /^\/files\/\d+$/,
          method: Methods.DELETE,
          limit: 1,
          timeFrame: 60000,
        },
        {
          path: /^\/files\/\d+$/,
          method: Methods.GET,
          limit: 100,
          timeFrame: 60000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      const getResult = resolver.resolve(mockReq('/files/123', Methods.GET));
      const deleteResult = resolver.resolve(mockReq('/files/123', Methods.DELETE));

      expect(getResult?.route.limit).toBe(100);
      expect(deleteResult?.route.limit).toBe(1);
    });

    it('first match wins with overlapping patterns', () => {
      const routes = [
        {
          path: /^\/api\/.*$/,
          method: Methods.GET,
          limit: 100,
          timeFrame: 1000,
        },
        {
          path: /^\/api\/admin\/.*$/,
          method: Methods.GET,
          limit: 10,
          timeFrame: 1000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      // First pattern matches both, so first route wins
      const r = resolver.resolve(mockReq('/api/admin/users'));
      expect(r?.route.limit).toBe(100); // First match
    });

    it('handles case-insensitive flags', () => {
      const routes = [
        {
          path: /^\/api\/v\d+\/users$/i, // case-insensitive
          method: Methods.GET,
          limit: 10,
          timeFrame: 1000,
        },
      ] satisfies RouteType[];
      const resolver = new RouteResolver(routes, new PathNormalizer());

      const r = resolver.resolve(mockReq('/API/V1/USERS'));
      expect(r).not.toBeNull();
    });
  });
});
