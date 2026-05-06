// SPDX-License-Identifier: Apache-2.0
import type { HttpRequestLike, TenantResolution, TenantResolverStrategy } from '../strategy.js';

const NON_PRINTABLE = /[^\x20-\x7E]/;
const PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

export interface PathStrategyOptions {
  /**
   * Path pattern with `:tenantId` placeholder, e.g. `/t/:tenantId/...`.
   * The pattern matches against the URL path (no query string) after
   * URL-normalisation (decode + `..` collapse). Trailing `...` is treated
   * as a wildcard that matches anything after the captured tenant.
   */
  readonly pathPattern: string;
}

interface CompiledPattern {
  readonly regex: RegExp;
  readonly groups: readonly string[];
}

function compilePattern(pattern: string): CompiledPattern {
  const groups: string[] = [];
  let body = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  body = body.replace(/\\\.\\\.\\\./g, '___WILDCARD___');
  body = body.replace(PARAM_RE, (_, name: string) => {
    groups.push(name);
    return '([^/]+)';
  });
  body = body.replace(/___WILDCARD___/g, '.*');
  return { regex: new RegExp(`^${body}$`), groups };
}

/**
 * Decode + canonicalise a URL path, rejecting traversal attempts.
 *
 * Returns `null` if the path contains characters that survive a single
 * decoding pass and indicate a traversal payload (`..` segment, NUL
 * byte, control character). Multi-encoded payloads (`%252e%252e`) are
 * caught by the post-decode `..` segment check.
 */
function normalisePath(rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || NON_PRINTABLE.test(decoded)) {
    return null;
  }

  const segments = decoded.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      return null;
    }
  }
  return decoded;
}

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Extracts a tenant identifier from a path parameter.
 *
 * SECURITY (security P1-1):
 *   - URL is decoded once and inspected for traversal payloads
 *     (`..`, `%2F`, NUL bytes, non-printable characters) before matching.
 *   - The captured `tenantId` is rejected if it still contains `/`, `%`,
 *     control characters or non-printable bytes — these are the bytes
 *     attackers use to escape a path segment after a single decoding pass.
 *   - Returns `null` (not throws) on any rejection so chained strategies
 *     can transparently take over.
 */
export class PathStrategy implements TenantResolverStrategy<HttpRequestLike> {
  readonly name = 'path';
  private readonly compiled: CompiledPattern;

  constructor(options: PathStrategyOptions) {
    if (!options.pathPattern || !options.pathPattern.startsWith('/')) {
      throw new Error('PathStrategy requires pathPattern starting with "/"');
    }
    this.compiled = compilePattern(options.pathPattern);
    if (!this.compiled.groups.includes('tenantId')) {
      throw new Error('PathStrategy pathPattern must contain :tenantId placeholder');
    }
  }

  async resolve(req: HttpRequestLike): Promise<TenantResolution | null> {
    if (!req.url) return null;
    const rawPath = stripQuery(req.url);
    const normalised = normalisePath(rawPath);
    if (normalised === null) return null;

    const match = this.compiled.regex.exec(normalised);
    if (!match) return null;

    const idx = this.compiled.groups.indexOf('tenantId');
    const captured = match[idx + 1];
    if (captured === undefined || captured === '') return null;

    if (
      captured.includes('/') ||
      captured.includes('%') ||
      captured.includes('\0') ||
      NON_PRINTABLE.test(captured)
    ) {
      return null;
    }

    return { tenantId: captured, strategyName: this.name };
  }
}
