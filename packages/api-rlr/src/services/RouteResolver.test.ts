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
});
