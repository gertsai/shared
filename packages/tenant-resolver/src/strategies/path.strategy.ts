// SPDX-License-Identifier: Apache-2.0
import type { HttpRequestLike, TenantResolution, TenantResolverStrategy } from '../strategy.js';

/**
 * Rejects ASCII control characters and bytes outside the printable ASCII
 * range (U+0020..U+007E). This is intentionally narrower than the full Unicode
 * "printable" class — it does NOT permit Cyrillic, CJK, emoji, or any
 * non-Latin-1 characters. Internationalised tenant IDs (UTF-8 URL paths)
 * therefore fail-closed here; callers needing IDN support must layer their
 * own Punycode/NFC normalisation in a custom strategy.
 *
 * Wave 26 (EVID-080 M7): documented ASCII-only constraint explicitly so the
 * fail-closed behaviour is no longer a silent surprise. Behaviour unchanged.
 */
const NON_PRINTABLE = /[^\x20-\x7E]/;
const PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Internal sentinel for the `...` wildcard transform inside `compilePattern`.
 *
 * Wave 26 (EVID-080 M6): the sentinel is a non-printable token built from
 * Unit-Separator control characters (`\x1F`, U+001F). The previous value
 * `'___WILDCARD___'` was printable ASCII; a config-author pattern containing
 * the literal string `___WILDCARD___` would have collided silently after the
 * regex-escape pass (which does NOT escape underscores), producing a
 * wrong-regex compile with no warning. The `\x1F` byte cannot appear in any
 * well-formed JSON/TypeScript-quoted pattern without deliberate injection,
 * making accidental collision impossible.
 */
const WILDCARD_SENTINEL = '\x1FWILDCARD\x1F';

export interface PathStrategyOptions {
  /**
   * Path pattern with `:tenantId` placeholder, e.g. `/t/:tenantId/...`.
   * The pattern matches against the URL path (no query string) after
   * URL-normalisation (decode + `..` collapse).
   *
   * Wildcard semantics (Sprint 3.10 W-3-10-7):
   *   The literal `...` token is treated as `.*` ONLY when used as a
   *   trailing token. Mid-pattern `...` (e.g. `/t/:tenantId/.../foo`)
   *   compiles but matches only literally — `compilePattern` does not
   *   anchor a non-trailing wildcard against the rest of the URL, so
   *   such patterns are nearly always a configuration mistake. Prefer
   *   discrete `:param` segments for non-tail captures.
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
  // The escaped `\.\.\.` sequence is the post-escape form of `...`.
  // Replace with a non-printable sentinel that no well-formed pattern can
  // contain (EVID-080 M6), then expand it to `.*` after `:param` interpolation.
  body = body.replace(/\\\.\\\.\\\./g, WILDCARD_SENTINEL);
  body = body.replace(PARAM_RE, (_, name: string) => {
    groups.push(name);
    return '([^/]+)';
  });
  body = body.split(WILDCARD_SENTINEL).join('.*');
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
