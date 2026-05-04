import type { IncomingRequest, RouteType } from '../utils/types';

import { PathNormalizer } from './PathNormalizer';

type CompiledRoute = {
  original: RouteType;
  methodLower: string;
  isRegExp: boolean;
  pathPattern: string | RegExp;
  regex?: RegExp;
  paramNames?: string[];
};

export type RouteMatch = {
  route: RouteType;
  bucketId: string;
  params: Record<string, string>;
};

/**
 * Centralized resolver for matching requests to configured routes.
 * Uses PathNormalizer and keeps a small cache of compiled patterns.
 */
export class RouteResolver {
  private readonly normalizer: PathNormalizer;
  private readonly compiled: CompiledRoute[] = [];
  private readonly cacheKey: string;

  constructor(routes: ReadonlyArray<RouteType> | undefined, normalizer?: PathNormalizer) {
    this.normalizer = normalizer ?? new PathNormalizer();
    this.cacheKey = String(routes?.length ?? 0);
    if (routes && routes.length) {
      for (const r of routes) {
        const methodLower = (r.method || 'GET').toLowerCase();
        if (r.path instanceof RegExp) {
          this.compiled.push({
            original: r,
            methodLower,
            isRegExp: true,
            pathPattern: r.path,
            regex: r.path,
          });
        } else {
          const { regex, paramNames } = this.compileStringPattern(r.path);
          this.compiled.push({
            original: r,
            methodLower,
            isRegExp: false,
            pathPattern: r.path,
            regex,
            paramNames,
          });
        }
      }
    }
  }

  /**
   * Resolve a request to a configured route and compute canonical bucketId.
   */
  resolve(request: IncomingRequest): RouteMatch | null {
    const methodLower = (request.method || 'GET').toLowerCase();
    const rawPath = (request.url || request.originalUrl || '').toString();
    const normPath = this.normalizer.normalize(rawPath);

    for (const entry of this.compiled) {
      if (entry.methodLower !== methodLower) {
        continue;
      }

      if (!entry.regex) {
        continue;
      }
      const m = entry.regex.exec(rawPath) || entry.regex.exec(normPath);
      if (!m) {
        continue;
      }

      const params: Record<string, string> = {};
      if (entry.paramNames && entry.paramNames.length) {
        for (let i = 0; i < entry.paramNames.length; i += 1) {
          const v = m[i + 1];
          const name = entry.paramNames[i];
          if (v !== undefined && name) {
            params[name] = String(v);
          }
        }
      }

      // Keep bucketId compatible with current behavior: methodLower:normalizedPath
      const bucketId = `${methodLower}:${normPath}`;
      return { route: entry.original, bucketId, params };
    }

    return null;
  }

  private compileStringPattern(pattern: string): {
    regex: RegExp;
    paramNames: string[];
  } {
    // Normalize trailing slash for the pattern itself
    const cleaned = pattern.endsWith('/') && pattern !== '/' ? pattern.slice(0, -1) : pattern;
    const paramNames: string[] = [];
    // Convert ":param" segments to a capture group and remember param names
    const source = cleaned.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => {
      const name = m.slice(1);
      paramNames.push(name);
      return '([^/]+)';
    });
    // Anchor regex and allow end or slash-end
    const re = new RegExp(`^${source}(?:/)?$`, 'i');
    return { regex: re, paramNames };
  }
}
