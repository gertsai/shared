import { describe, it, expect } from 'vitest';

import {
  // Prefix utilities
  prefixUserEmail,
  prefixUserGroup,
  prefixExternalGroup,
  buildExternalGroupId,
  parseExternalGroupId,
  // Type guards
  isUserEmailAcl,
  isGroupAcl,
  isExternalGroupAcl,
  isPublicAcl,
  extractAclValue,
  // Constants
  PUBLIC_DOC_ACL,
  ACL_PREFIX_USER_EMAIL,
  ACL_PREFIX_GROUP,
  ACL_PREFIX_EXTERNAL_GROUP,
  // ExternalAccess
  createExternalAccess,
  createPublicExternalAccess,
  createEmptyExternalAccess,
  getExternalAccessEntryCount,
  isExternalAccessOverLimit,
  externalAccessToJson,
  externalAccessFromJson,
  MAX_EXTERNAL_ACCESS_ENTRIES,
  // DocumentAccess
  createDocumentAccess,
  createPublicDocumentAccess,
  documentAccessToAcl,
  buildUserAcl,
  canAccessDocument,
  documentAccessToJson,
  documentAccessFromJson,
  mergeExternalAccessWithInternal,
} from './acl';

describe('ACL Prefix Utilities', () => {
  describe('prefixUserEmail', () => {
    it('prefixes user email correctly', () => {
      expect(prefixUserEmail('user@example.com')).toBe('user_email:user@example.com');
    });
  });

  describe('prefixUserGroup', () => {
    it('prefixes user group correctly', () => {
      expect(prefixUserGroup('engineering')).toBe('group:engineering');
    });
  });

  describe('prefixExternalGroup', () => {
    it('prefixes external group correctly', () => {
      expect(prefixExternalGroup('google_drive::folder123')).toBe(
        'external_group:google_drive::folder123',
      );
    });
  });

  describe('buildExternalGroupId', () => {
    it('builds external group ID with source prefix', () => {
      expect(buildExternalGroupId('FOLDER123', 'google_drive')).toBe('google_drive::folder123');
    });

    it('lowercases the result', () => {
      expect(buildExternalGroupId('ABC', 'CONFLUENCE')).toBe('confluence::abc');
    });
  });

  describe('parseExternalGroupId', () => {
    it('parses valid external group ID', () => {
      expect(parseExternalGroupId('google_drive::folder123')).toEqual({
        source: 'google_drive',
        groupId: 'folder123',
      });
    });

    it('returns null for invalid format', () => {
      expect(parseExternalGroupId('no_separator')).toBeNull();
    });

    it('handles multiple separators', () => {
      expect(parseExternalGroupId('source::group::subgroup')).toEqual({
        source: 'source',
        groupId: 'group::subgroup',
      });
    });
  });
});

describe('ACL Type Guards', () => {
  describe('isUserEmailAcl', () => {
    it('returns true for user email ACL', () => {
      expect(isUserEmailAcl('user_email:test@example.com')).toBe(true);
    });

    it('returns false for other ACL types', () => {
      expect(isUserEmailAcl('group:engineering')).toBe(false);
      expect(isUserEmailAcl('external_group:test')).toBe(false);
      expect(isUserEmailAcl(PUBLIC_DOC_ACL)).toBe(false);
    });
  });

  describe('isGroupAcl', () => {
    it('returns true for group ACL', () => {
      expect(isGroupAcl('group:engineering')).toBe(true);
    });

    it('returns false for other ACL types', () => {
      expect(isGroupAcl('user_email:test@example.com')).toBe(false);
    });
  });

  describe('isExternalGroupAcl', () => {
    it('returns true for external group ACL', () => {
      expect(isExternalGroupAcl('external_group:google_drive::folder123')).toBe(true);
    });

    it('returns false for other ACL types', () => {
      expect(isExternalGroupAcl('group:engineering')).toBe(false);
    });
  });

  describe('isPublicAcl', () => {
    it('returns true for public ACL', () => {
      expect(isPublicAcl(PUBLIC_DOC_ACL)).toBe(true);
    });

    it('returns false for other ACL types', () => {
      expect(isPublicAcl('user_email:test@example.com')).toBe(false);
    });
  });

  describe('extractAclValue', () => {
    it('extracts value from user email ACL', () => {
      expect(extractAclValue('user_email:test@example.com')).toBe('test@example.com');
    });

    it('extracts value from group ACL', () => {
      expect(extractAclValue('group:engineering')).toBe('engineering');
    });

    it('extracts value from external group ACL', () => {
      expect(extractAclValue('external_group:google_drive::folder123')).toBe(
        'google_drive::folder123',
      );
    });

    it('returns public constant for public ACL', () => {
      expect(extractAclValue(PUBLIC_DOC_ACL)).toBe(PUBLIC_DOC_ACL);
    });

    it('returns null for unknown ACL', () => {
      expect(extractAclValue('unknown:value')).toBeNull();
    });
  });
});

describe('ExternalAccess', () => {
  describe('createExternalAccess', () => {
    it('creates with all fields', () => {
      const access = createExternalAccess({
        externalUserEmails: ['user1@ext.com', 'user2@ext.com'],
        externalUserGroupIds: ['group1', 'group2'],
        isPublic: false,
      });

      expect(access.externalUserEmails.size).toBe(2);
      expect(access.externalUserGroupIds.size).toBe(2);
      expect(access.isPublic).toBe(false);
    });

    it('creates with defaults', () => {
      const access = createExternalAccess({});
      expect(access.externalUserEmails.size).toBe(0);
      expect(access.externalUserGroupIds.size).toBe(0);
      expect(access.isPublic).toBe(false);
    });
  });

  describe('createPublicExternalAccess', () => {
    it('creates public access', () => {
      const access = createPublicExternalAccess();
      expect(access.isPublic).toBe(true);
      expect(access.externalUserEmails.size).toBe(0);
    });
  });

  describe('createEmptyExternalAccess', () => {
    it('creates empty private access', () => {
      const access = createEmptyExternalAccess();
      expect(access.isPublic).toBe(false);
      expect(access.externalUserEmails.size).toBe(0);
    });
  });

  describe('getExternalAccessEntryCount', () => {
    it('counts entries correctly', () => {
      const access = createExternalAccess({
        externalUserEmails: ['a@b.com', 'c@d.com'],
        externalUserGroupIds: ['g1'],
      });
      expect(getExternalAccessEntryCount(access)).toBe(3);
    });
  });

  describe('isExternalAccessOverLimit', () => {
    it('returns false for small access', () => {
      const access = createExternalAccess({
        externalUserEmails: ['a@b.com'],
      });
      expect(isExternalAccessOverLimit(access)).toBe(false);
    });

    it('returns true when exceeding limit', () => {
      const manyEmails = Array.from(
        { length: MAX_EXTERNAL_ACCESS_ENTRIES + 1 },
        (_, i) => `user${i}@example.com`,
      );
      const access = createExternalAccess({
        externalUserEmails: manyEmails,
      });
      expect(isExternalAccessOverLimit(access)).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('round-trips correctly', () => {
      const original = createExternalAccess({
        externalUserEmails: ['a@b.com'],
        externalUserGroupIds: ['g1'],
        isPublic: true,
      });
      const json = externalAccessToJson(original);
      const restored = externalAccessFromJson(json);

      expect([...restored.externalUserEmails]).toEqual([...original.externalUserEmails]);
      expect([...restored.externalUserGroupIds]).toEqual([...original.externalUserGroupIds]);
      expect(restored.isPublic).toBe(original.isPublic);
    });
  });
});

describe('DocumentAccess', () => {
  describe('createDocumentAccess', () => {
    it('creates with all fields', () => {
      const access = createDocumentAccess({
        userEmails: ['user@gerts.ai'],
        userGroups: ['engineering'],
        externalUserEmails: ['ext@example.com'],
        externalUserGroupIds: ['google_drive::folder1'],
        isPublic: false,
      });

      expect(access.userEmails.has('user@gerts.ai')).toBe(true);
      expect(access.userGroups.has('engineering')).toBe(true);
      expect(access.externalUserEmails.has('ext@example.com')).toBe(true);
      expect(access.externalUserGroupIds.has('google_drive::folder1')).toBe(true);
      expect(access.isPublic).toBe(false);
    });

    it('filters null values from userEmails', () => {
      const access = createDocumentAccess({
        userEmails: ['user@gerts.ai', null, 'admin@gerts.ai', null],
      });
      expect(access.userEmails.size).toBe(2);
      expect(access.userEmails.has('user@gerts.ai')).toBe(true);
    });
  });

  describe('createPublicDocumentAccess', () => {
    it('creates public access', () => {
      const access = createPublicDocumentAccess();
      expect(access.isPublic).toBe(true);
    });
  });

  describe('documentAccessToAcl', () => {
    it('converts to ACL set correctly', () => {
      const access = createDocumentAccess({
        userEmails: ['user@gerts.ai'],
        userGroups: ['engineering'],
        externalUserEmails: ['ext@example.com'],
        externalUserGroupIds: ['google_drive::folder1'],
        isPublic: false,
      });

      const acl = documentAccessToAcl(access);

      expect(acl.has(`${ACL_PREFIX_USER_EMAIL}user@gerts.ai`)).toBe(true);
      expect(acl.has(`${ACL_PREFIX_GROUP}engineering`)).toBe(true);
      expect(acl.has(`${ACL_PREFIX_USER_EMAIL}ext@example.com`)).toBe(true);
      expect(acl.has(`${ACL_PREFIX_EXTERNAL_GROUP}google_drive::folder1`)).toBe(true);
      expect(acl.has(PUBLIC_DOC_ACL)).toBe(false);
    });

    it('includes public marker when isPublic', () => {
      const access = createDocumentAccess({ isPublic: true });
      const acl = documentAccessToAcl(access);
      expect(acl.has(PUBLIC_DOC_ACL)).toBe(true);
    });
  });

  describe('buildUserAcl', () => {
    it('builds user ACL with all memberships', () => {
      const userAcl = buildUserAcl({
        userEmail: 'user@gerts.ai',
        userGroups: ['engineering', 'devops'],
        externalGroupIds: ['google_drive::folder1'],
        includePublic: true,
      });

      expect(userAcl.has(`${ACL_PREFIX_USER_EMAIL}user@gerts.ai`)).toBe(true);
      expect(userAcl.has(`${ACL_PREFIX_GROUP}engineering`)).toBe(true);
      expect(userAcl.has(`${ACL_PREFIX_GROUP}devops`)).toBe(true);
      expect(userAcl.has(`${ACL_PREFIX_EXTERNAL_GROUP}google_drive::folder1`)).toBe(true);
      expect(userAcl.has(PUBLIC_DOC_ACL)).toBe(true);
    });

    it('excludes public when requested', () => {
      const userAcl = buildUserAcl({
        userEmail: 'user@gerts.ai',
        includePublic: false,
      });

      expect(userAcl.has(PUBLIC_DOC_ACL)).toBe(false);
    });
  });

  describe('canAccessDocument', () => {
    it('returns true when ACLs intersect', () => {
      const userAcl = buildUserAcl({
        userEmail: 'user@gerts.ai',
        userGroups: ['engineering'],
      });

      const docAcl = documentAccessToAcl(
        createDocumentAccess({
          userGroups: ['engineering'],
        }),
      );

      expect(canAccessDocument(userAcl, docAcl)).toBe(true);
    });

    it('returns false when ACLs do not intersect', () => {
      const userAcl = buildUserAcl({
        userEmail: 'user@gerts.ai',
        userGroups: ['sales'],
        includePublic: false,
      });

      const docAcl = documentAccessToAcl(
        createDocumentAccess({
          userGroups: ['engineering'],
          isPublic: false,
        }),
      );

      expect(canAccessDocument(userAcl, docAcl)).toBe(false);
    });

    it('returns true for public documents', () => {
      const userAcl = buildUserAcl({
        userEmail: 'user@gerts.ai',
        includePublic: true,
      });

      const docAcl = documentAccessToAcl(createPublicDocumentAccess());

      expect(canAccessDocument(userAcl, docAcl)).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('round-trips correctly', () => {
      const original = createDocumentAccess({
        userEmails: ['user@gerts.ai'],
        userGroups: ['engineering'],
        externalUserEmails: ['ext@example.com'],
        externalUserGroupIds: ['g1'],
        isPublic: true,
      });

      const json = documentAccessToJson(original);
      const restored = documentAccessFromJson(json);

      expect([...restored.userEmails]).toEqual([...original.userEmails]);
      expect([...restored.userGroups]).toEqual([...original.userGroups]);
      expect([...restored.externalUserEmails]).toEqual([...original.externalUserEmails]);
      expect([...restored.externalUserGroupIds]).toEqual([...original.externalUserGroupIds]);
      expect(restored.isPublic).toBe(original.isPublic);
    });
  });

  describe('mergeExternalAccessWithInternal', () => {
    it('merges external and internal access', () => {
      const external = createExternalAccess({
        externalUserEmails: ['ext@example.com'],
        externalUserGroupIds: ['google_drive::folder1'],
        isPublic: false,
      });

      const merged = mergeExternalAccessWithInternal(external, {
        userEmails: ['user@gerts.ai'],
        userGroups: ['engineering'],
      });

      expect(merged.userEmails.has('user@gerts.ai')).toBe(true);
      expect(merged.userGroups.has('engineering')).toBe(true);
      expect(merged.externalUserEmails.has('ext@example.com')).toBe(true);
      expect(merged.externalUserGroupIds.has('google_drive::folder1')).toBe(true);
      expect(merged.isPublic).toBe(false);
    });

    it('preserves isPublic from external access', () => {
      const external = createPublicExternalAccess();
      const merged = mergeExternalAccessWithInternal(external);
      expect(merged.isPublic).toBe(true);
    });
  });
});
