/**
 * Tests for GertsListResponse envelope types
 */
import { describe, it, expect } from 'vitest';
import {
  type GertsListResponse,
  type PaginationInfo,
  type PaginationParams,
  type SortConfig,
  encodeCursor,
  decodeCursor,
  createGertsListResponse,
  createPaginationInfo,
  pageToOffset,
  offsetToPage,
  totalPages,
  isListResponse,
} from './list';

describe('GertsListResponse Envelope', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('should encode and decode cursor correctly', () => {
      const data = { id: 'entity_123', offset: 100 };
      const cursor = encodeCursor(data);
      const decoded = decodeCursor<typeof data>(cursor);

      expect(decoded).toEqual(data);
    });

    it('should handle empty object', () => {
      const cursor = encodeCursor({});
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual({});
    });

    it('should handle complex objects', () => {
      const data = {
        id: 'abc123',
        filters: { type: 'Person', active: true },
        timestamp: 1704067200,
      };
      const cursor = encodeCursor(data);
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual(data);
    });

    it('should return null for invalid cursor', () => {
      expect(decodeCursor('invalid-base64')).toBe(null);
      expect(decodeCursor('')).toBe(null);
    });

    it('should use base64url encoding', () => {
      const data = { special: 'chars+/=' };
      const cursor = encodeCursor(data);
      // base64url should not contain +, /, or =
      expect(cursor).not.toMatch(/[+/]/);
    });
  });

  describe('PaginationInfo', () => {
    it('should define all pagination fields', () => {
      const pagination: PaginationInfo = {
        total: 100,
        count: 20,
        limit: 20,
        offset: 0,
        has_more: true,
        next_cursor: 'cursor123',
        prev_cursor: undefined,
      };

      expect(pagination.total).toBe(100);
      expect(pagination.count).toBe(20);
      expect(pagination.limit).toBe(20);
      expect(pagination.offset).toBe(0);
      expect(pagination.has_more).toBe(true);
      expect(pagination.next_cursor).toBe('cursor123');
    });

    it('should handle last page', () => {
      const pagination: PaginationInfo = {
        total: 100,
        count: 10,
        limit: 20,
        offset: 90,
        has_more: false,
      };

      expect(pagination.has_more).toBe(false);
      expect(pagination.next_cursor).toBeUndefined();
    });
  });

  describe('PaginationParams', () => {
    it('should define request parameters', () => {
      const params: PaginationParams = {
        limit: 50,
        offset: 100,
        after: 'cursor123',
        before: 'cursor456',
      };

      expect(params.limit).toBe(50);
      expect(params.offset).toBe(100);
      expect(params.after).toBe('cursor123');
      expect(params.before).toBe('cursor456');
    });

    it('should allow all optional fields', () => {
      const params: PaginationParams = {};
      expect(params.limit).toBeUndefined();
      expect(params.offset).toBeUndefined();
    });
  });

  describe('SortConfig', () => {
    it('should define sort configuration', () => {
      const sort: SortConfig = {
        field: 'created_at',
        order: 'desc',
      };

      expect(sort.field).toBe('created_at');
      expect(sort.order).toBe('desc');
    });

    it('should accept asc order', () => {
      const sort: SortConfig = { field: 'name', order: 'asc' };
      expect(sort.order).toBe('asc');
    });
  });

  describe('GertsListResponse<T>', () => {
    interface TestEntity {
      id: string;
      name: string;
    }

    it('should define required fields', () => {
      const response: GertsListResponse<TestEntity> = {
        id: 'lst_abc123def456',
        object: 'entity.list',
        created: 1704067200,
        success: true,
        data: [
          { id: 'e1', name: 'Entity 1' },
          { id: 'e2', name: 'Entity 2' },
        ],
        pagination: {
          total: 100,
          count: 2,
          limit: 20,
          offset: 0,
          has_more: true,
        },
        tenant_id: 'demo',
      };

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.pagination.total).toBe(100);
    });

    it('should accept optional fields', () => {
      const response: GertsListResponse<TestEntity> = {
        id: 'lst_abc123def456',
        object: 'entity.list',
        created: 1704067200,
        success: true,
        data: [],
        pagination: {
          total: 0,
          count: 0,
          limit: 20,
          offset: 0,
          has_more: false,
        },
        tenant_id: 'demo',
        sort: { field: 'name', order: 'asc' },
        filters: { type: 'Person' },
        trace_id: 'trace-123',
      };

      expect(response.sort?.field).toBe('name');
      expect(response.filters?.type).toBe('Person');
      expect(response.trace_id).toBe('trace-123');
    });
  });

  describe('createGertsListResponse', () => {
    interface TestItem {
      id: string;
      value: number;
    }

    it('should create response with required fields', () => {
      const items: TestItem[] = [
        { id: '1', value: 10 },
        { id: '2', value: 20 },
      ];

      const response = createGertsListResponse({
        object: 'list',
        data: items,
        tenant_id: 'demo',
        total: 50,
      });

      expect(response.id).toMatch(/^lst_/);
      expect(response.object).toBe('list');
      expect(response.success).toBe(true);
      expect(response.data).toEqual(items);
      expect(response.tenant_id).toBe('demo');
      expect(response.pagination.total).toBe(50);
      expect(response.pagination.count).toBe(2);
      expect(response.pagination.limit).toBe(20); // default
      expect(response.pagination.offset).toBe(0); // default
      expect(response.pagination.has_more).toBe(true); // 2 < 50
    });

    it('should calculate has_more correctly', () => {
      // First page, more items exist
      const firstPage = createGertsListResponse({
        object: 'list',
        data: Array(20).fill({ id: '1', value: 1 }),
        tenant_id: 'demo',
        total: 100,
        limit: 20,
        offset: 0,
      });
      expect(firstPage.pagination.has_more).toBe(true);

      // Last page, no more items
      const lastPage = createGertsListResponse({
        object: 'list',
        data: Array(5).fill({ id: '1', value: 1 }),
        tenant_id: 'demo',
        total: 25,
        limit: 20,
        offset: 20,
      });
      expect(lastPage.pagination.has_more).toBe(false);

      // Exact fit
      const exactFit = createGertsListResponse({
        object: 'list',
        data: Array(20).fill({ id: '1', value: 1 }),
        tenant_id: 'demo',
        total: 20,
        limit: 20,
        offset: 0,
      });
      expect(exactFit.pagination.has_more).toBe(false);
    });

    it('should include optional fields', () => {
      const response = createGertsListResponse({
        object: 'entity.list',
        data: [{ id: '1', value: 1 }],
        tenant_id: 'demo',
        total: 1,
        sort: { field: 'value', order: 'desc' },
        filters: { active: true },
        next_cursor: 'cursor123',
        trace_id: 'trace-abc',
      });

      expect(response.sort).toEqual({ field: 'value', order: 'desc' });
      expect(response.filters).toEqual({ active: true });
      expect(response.pagination.next_cursor).toBe('cursor123');
      expect(response.trace_id).toBe('trace-abc');
    });

    it('should use custom ID when provided', () => {
      const response = createGertsListResponse({
        object: 'list',
        data: [],
        tenant_id: 'demo',
        total: 0,
        id: 'custom_mylist123',
      });

      expect(response.id).toBe('custom_mylist123');
    });
  });

  describe('createPaginationInfo', () => {
    it('should create pagination info from params', () => {
      const pagination = createPaginationInfo({ limit: 20, offset: 40 }, 100, 20);

      expect(pagination.total).toBe(100);
      expect(pagination.count).toBe(20);
      expect(pagination.limit).toBe(20);
      expect(pagination.offset).toBe(40);
      expect(pagination.has_more).toBe(true); // 40 + 20 < 100
    });

    it('should use defaults for empty params', () => {
      const pagination = createPaginationInfo({}, 50, 10);

      expect(pagination.limit).toBe(20); // default
      expect(pagination.offset).toBe(0); // default
    });

    it('should calculate has_more correctly', () => {
      // More items available
      const moreAvailable = createPaginationInfo({ limit: 20, offset: 0 }, 50, 20);
      expect(moreAvailable.has_more).toBe(true);

      // Last page
      const lastPage = createPaginationInfo({ limit: 20, offset: 40 }, 50, 10);
      expect(lastPage.has_more).toBe(false);
    });
  });

  describe('pageToOffset', () => {
    it('should calculate offset from page number', () => {
      expect(pageToOffset(1, 20)).toBe(0);
      expect(pageToOffset(2, 20)).toBe(20);
      expect(pageToOffset(3, 20)).toBe(40);
      expect(pageToOffset(5, 10)).toBe(40);
    });

    it('should handle page 0 as page 1', () => {
      expect(pageToOffset(0, 20)).toBe(0);
    });

    it('should handle negative page numbers', () => {
      expect(pageToOffset(-1, 20)).toBe(0);
    });
  });

  describe('offsetToPage', () => {
    it('should calculate page number from offset', () => {
      expect(offsetToPage(0, 20)).toBe(1);
      expect(offsetToPage(20, 20)).toBe(2);
      expect(offsetToPage(40, 20)).toBe(3);
      expect(offsetToPage(45, 20)).toBe(3); // 45/20 = 2.25, floor = 2, +1 = 3
    });

    it('should handle partial offsets', () => {
      expect(offsetToPage(15, 20)).toBe(1); // 15/20 = 0.75, floor = 0, +1 = 1
      expect(offsetToPage(21, 20)).toBe(2); // 21/20 = 1.05, floor = 1, +1 = 2
    });
  });

  describe('totalPages', () => {
    it('should calculate total pages', () => {
      expect(totalPages(100, 20)).toBe(5);
      expect(totalPages(101, 20)).toBe(6);
      expect(totalPages(99, 20)).toBe(5);
      expect(totalPages(0, 20)).toBe(0);
    });

    it('should handle single page', () => {
      expect(totalPages(5, 20)).toBe(1);
      expect(totalPages(20, 20)).toBe(1);
    });

    it('should handle exact multiples', () => {
      expect(totalPages(40, 20)).toBe(2);
      expect(totalPages(60, 20)).toBe(3);
    });
  });

  describe('isListResponse', () => {
    it('should return true for valid list response', () => {
      const response = createGertsListResponse({
        object: 'entity.list',
        data: [{ id: '1' }],
        tenant_id: 'demo',
        total: 1,
      });

      expect(isListResponse(response)).toBe(true);
    });

    it('should return false for non-list success response', () => {
      const response = {
        success: true,
        data: { answer: 'test' }, // not an array
      };

      expect(isListResponse(response)).toBe(false);
    });

    it('should return false for error response', () => {
      const response = {
        success: false,
        error: { message: 'Error' },
      };

      expect(isListResponse(response)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isListResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isListResponse(undefined)).toBe(false);
    });

    it('should return false for response without pagination', () => {
      const response = {
        success: true,
        data: [],
        // missing pagination
      };

      expect(isListResponse(response)).toBe(false);
    });
  });
});
