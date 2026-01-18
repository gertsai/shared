import { describe, it, expect } from 'vitest';
import {
  FGA_TYPES,
  FGA_RELATIONS,
  FGA_DEFAULT_CONFIG,
  userString,
  teamMemberString,
  roleAssigneeString,
  objectString,
  parseObjectString,
  parseUserString,
} from '../constants.js';

describe('constants', () => {
  describe('FGA_TYPES', () => {
    it('should have all resource types', () => {
      expect(FGA_TYPES.USER).toBe('user');
      expect(FGA_TYPES.TENANT).toBe('tenant');
      expect(FGA_TYPES.ROLE).toBe('role');
      expect(FGA_TYPES.TEAM).toBe('team');
      expect(FGA_TYPES.PROJECT).toBe('project');
      expect(FGA_TYPES.ENTITY).toBe('entity');
      expect(FGA_TYPES.QUERY).toBe('query');
      expect(FGA_TYPES.API_KEY).toBe('api_key');
    });
  });

  describe('FGA_RELATIONS', () => {
    it('should have all common relations', () => {
      expect(FGA_RELATIONS.MEMBER).toBe('member');
      expect(FGA_RELATIONS.ADMIN).toBe('admin');
      expect(FGA_RELATIONS.OWNER).toBe('owner');
    });

    it('should have all access levels', () => {
      expect(FGA_RELATIONS.VIEWER).toBe('viewer');
      expect(FGA_RELATIONS.EDITOR).toBe('editor');
      expect(FGA_RELATIONS.LEAD).toBe('lead');
    });

    it('should have all permissions', () => {
      expect(FGA_RELATIONS.CAN_VIEW).toBe('can_view');
      expect(FGA_RELATIONS.CAN_EDIT).toBe('can_edit');
      expect(FGA_RELATIONS.CAN_DELETE).toBe('can_delete');
      expect(FGA_RELATIONS.CAN_MANAGE).toBe('can_manage');
    });
  });

  describe('FGA_DEFAULT_CONFIG', () => {
    it('should have default API URL', () => {
      expect(FGA_DEFAULT_CONFIG.apiUrl).toContain('localhost:8080');
    });

    it('should have default store name', () => {
      expect(FGA_DEFAULT_CONFIG.storeName).toBe('gerts');
    });

    it('should have retry config', () => {
      expect(FGA_DEFAULT_CONFIG.retry.maxAttempts).toBe(3);
      expect(FGA_DEFAULT_CONFIG.retry.initialDelay).toBe(100);
      expect(FGA_DEFAULT_CONFIG.retry.maxDelay).toBe(1000);
    });
  });
});

describe('string helpers', () => {
  describe('userString', () => {
    it('should create user string', () => {
      expect(userString('123')).toBe('user:123');
      expect(userString('abc-def')).toBe('user:abc-def');
    });
  });

  describe('teamMemberString', () => {
    it('should create team member userset string', () => {
      expect(teamMemberString('alpha')).toBe('team:alpha#member');
    });
  });

  describe('roleAssigneeString', () => {
    it('should create role assignee userset string', () => {
      expect(roleAssigneeString('admin')).toBe('role:admin#assignee');
    });
  });

  describe('objectString', () => {
    it('should create object string', () => {
      expect(objectString('project', 'demo')).toBe('project:demo');
      expect(objectString('tenant', 'my-tenant')).toBe('tenant:my-tenant');
    });
  });

  describe('parseObjectString', () => {
    it('should parse simple object string', () => {
      expect(parseObjectString('project:demo')).toEqual({ type: 'project', id: 'demo' });
    });

    it('should handle IDs with colons', () => {
      expect(parseObjectString('entity:uuid:abc:123')).toEqual({ type: 'entity', id: 'uuid:abc:123' });
    });
  });

  describe('parseUserString', () => {
    it('should parse simple user string', () => {
      expect(parseUserString('user:123')).toEqual({ type: 'user', id: '123' });
    });

    it('should parse userset string', () => {
      expect(parseUserString('team:alpha#member')).toEqual({
        type: 'team',
        id: 'alpha',
        relation: 'member',
      });
    });

    it('should parse role assignee string', () => {
      expect(parseUserString('role:admin#assignee')).toEqual({
        type: 'role',
        id: 'admin',
        relation: 'assignee',
      });
    });
  });
});
