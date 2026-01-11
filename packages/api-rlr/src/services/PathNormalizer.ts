/**
 * Service responsible for normalizing request paths to create consistent bucket keys
 */
export class PathNormalizer {
  private readonly idPattern = /\b[0-9a-fA-F-]{10,}\b/g;
  private readonly reactionsPattern = /\/reactions\/(.*)/;

  /**
   * Normalizes a request path for consistent bucket identification
   *
   * @param path - The raw request path
   * @returns Normalized path with IDs replaced and trailing slashes removed
   *
   * @example
   * normalize('/api/users/123456789012345') // returns '/api/users/:id'
   * normalize('/chats/ABC123DEF456/messages/') // returns '/chats/:id/messages'
   * normalize('/posts/123/reactions/heart') // returns '/posts/:id/reactions/:reaction'
   */
  normalize(path: string): string {
    if (!path) {
      return '';
    }

    let normalized = path.toLowerCase();

    // Replace long numeric or UUID-like segments with :id placeholder
    normalized = normalized.replace(this.idPattern, ':id');

    // Normalize reaction endpoints
    normalized = normalized.replace(this.reactionsPattern, '/reactions/:reaction');

    // Remove trailing slash except for root path
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Checks if a path matches a pattern (string or RegExp)
   *
   * @param path - The path to check
   * @param pattern - The pattern to match against
   * @returns True if the path matches the pattern
   */
  matches(path: string, pattern: string | RegExp): boolean {
    const normalizedPath = this.normalize(path);

    if (pattern instanceof RegExp) {
      return pattern.test(normalizedPath);
    }

    return normalizedPath === this.normalize(pattern);
  }

  /**
   * Extracts path segments that would be replaced by placeholders
   * Useful for debugging and logging
   *
   * @param path - The raw request path
   * @returns Object with extracted IDs and other dynamic segments
   */
  extractSegments(path: string): { ids: string[]; reaction?: string } {
    const ids: string[] = [];
    const idMatches = path.match(this.idPattern);

    if (idMatches) {
      ids.push(...idMatches);
    }

    const reactionMatch = path.match(this.reactionsPattern);
    const reaction = reactionMatch ? reactionMatch[1] : undefined;

    return { ids, reaction };
  }
}
