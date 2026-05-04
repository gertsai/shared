import { describe, expect, it } from 'vitest';

import { PathNormalizer } from './PathNormalizer';

describe('PathNormalizer', () => {
  const normalizer = new PathNormalizer();

  describe('normalize', () => {
    it('returns empty string for empty input', () => {
      expect(normalizer.normalize('')).toBe('');
      expect(normalizer.normalize(null as any)).toBe('');
      expect(normalizer.normalize(undefined as any)).toBe('');
    });

    it('converts path to lowercase', () => {
      expect(normalizer.normalize('/API/Users')).toBe('/api/users');
      expect(normalizer.normalize('/V2/Messages')).toBe('/v2/messages');
    });

    it('replaces long numeric IDs with :id', () => {
      expect(normalizer.normalize('/users/12345678901234567890')).toBe('/users/:id');
      expect(normalizer.normalize('/chats/98765432109876543210/messages')).toBe(
        '/chats/:id/messages',
      );
    });

    it('replaces UUID-like strings with :id', () => {
      expect(normalizer.normalize('/items/550e8400-e29b-41d4-a716-446655440000')).toBe(
        '/items/:id',
      );
      expect(normalizer.normalize('/api/ABC123DEF456')).toBe('/api/:id');
    });

    it('normalizes reaction endpoints', () => {
      expect(normalizer.normalize('/posts/123/reactions/heart')).toBe(
        '/posts/123/reactions/:reaction',
      );
      expect(normalizer.normalize('/messages/456/reactions/thumbs-up')).toBe(
        '/messages/456/reactions/:reaction',
      );
    });

    it('removes trailing slashes except for root', () => {
      expect(normalizer.normalize('/api/users/')).toBe('/api/users');
      expect(normalizer.normalize('/v2/messages/')).toBe('/v2/messages');
      expect(normalizer.normalize('/')).toBe('/');
    });

    it('handles complex paths with multiple IDs', () => {
      expect(
        normalizer.normalize('/orgs/12345678901234567890/repos/98765432109876543210/issues'),
      ).toBe('/orgs/:id/repos/:id/issues');
    });

    it('preserves short numeric segments', () => {
      expect(normalizer.normalize('/api/v2/items')).toBe('/api/v2/items');
      expect(normalizer.normalize('/users/123')).toBe('/users/123');
      expect(normalizer.normalize('/posts/999')).toBe('/posts/999');
    });
  });

  describe('matches', () => {
    it('matches exact string patterns', () => {
      expect(normalizer.matches('/api/users', '/api/users')).toBe(true);
      expect(normalizer.matches('/API/USERS', '/api/users')).toBe(true);
      expect(normalizer.matches('/api/users', '/api/posts')).toBe(false);
    });

    it('matches with ID normalization', () => {
      expect(normalizer.matches('/users/12345678901234567890', '/users/:id')).toBe(true);
      // Both paths get normalized to '/users/:id' so they match
      expect(normalizer.matches('/users/12345678901234567890', '/users/12345678901234567890')).toBe(
        true,
      );
    });

    it('matches RegExp patterns', () => {
      expect(normalizer.matches('/api/users', /^\/api\/.*/)).toBe(true);
      expect(normalizer.matches('/v2/messages', /^\/v2\/.*/)).toBe(true);
      expect(normalizer.matches('/api/users', /^\/v2\/.*/)).toBe(false);
    });

    it('matches normalized paths with RegExp', () => {
      expect(normalizer.matches('/users/12345678901234567890', /^\/users\/:id$/)).toBe(true);
    });
  });

  describe('extractSegments', () => {
    it('extracts IDs from path', () => {
      const result = normalizer.extractSegments(
        '/users/12345678901234567890/posts/98765432109876543210',
      );
      expect(result.ids).toEqual(['12345678901234567890', '98765432109876543210']);
      expect(result.reaction).toBeUndefined();
    });

    it('extracts reaction from path', () => {
      const result = normalizer.extractSegments('/posts/123/reactions/heart');
      expect(result.reaction).toBe('heart');
    });

    it('extracts both IDs and reaction', () => {
      const result = normalizer.extractSegments('/posts/12345678901234567890/reactions/thumbs-up');
      expect(result.ids).toEqual(['12345678901234567890']);
      expect(result.reaction).toBe('thumbs-up');
    });

    it('returns empty arrays when no matches', () => {
      const result = normalizer.extractSegments('/api/v2/status');
      expect(result.ids).toEqual([]);
      expect(result.reaction).toBeUndefined();
    });

    it('extracts UUID-like IDs', () => {
      const result = normalizer.extractSegments(
        '/items/550e8400-e29b-41d4-a716-446655440000/details',
      );
      expect(result.ids).toContain('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
