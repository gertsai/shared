import { describe, expect, it } from 'vitest';
import { RouteResolver } from './RouteResolver';
import { PathNormalizer } from './PathNormalizer';
import type { IncomingRequest, RouteType } from '../utils/types';

const mockReq = (url: string, method = 'GET'): IncomingRequest =>
  ({ method, url, originalUrl: url }) as IncomingRequest;

describe('RouteResolver (negative)', () => {
  it('returns null when routes array is empty', () => {
    const resolver = new RouteResolver([], new PathNormalizer());
    const r = resolver.resolve(mockReq('/any'));
    expect(r).toBeNull();
  });

  it('returns null when method does not match', () => {
    const routes: RouteType[] = [{ path: '/users/:id', method: 'GET' as any } as RouteType];
    const resolver = new RouteResolver(routes, new PathNormalizer());
    const r = resolver.resolve(mockReq('/users/1', 'POST'));
    expect(r).toBeNull();
  });
});
