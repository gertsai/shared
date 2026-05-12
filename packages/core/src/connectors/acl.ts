/**
 * ACL (Access Control List) Models and Utilities for Data Connectors (RFC-042)
 *
 * This module provides:
 * - ACL prefix utilities for consistent string formatting
 * - ExternalAccess model for external system permissions
 * - DocumentAccess model for combined internal + external permissions
 *
 * Ported from: sources/onyx/backend/onyx/access/models.py, utils.py
 */

// ============================================================================
// ACL Prefix Constants and Utilities
// ============================================================================

/** ACL prefix for user emails (both internal and external users) */
export const ACL_PREFIX_USER_EMAIL = 'user_email:' as const;

/** ACL prefix for internal user groups */
export const ACL_PREFIX_GROUP = 'group:' as const;

/** ACL prefix for external groups (with source separator) */
export const ACL_PREFIX_EXTERNAL_GROUP = 'external_group:' as const;

/** Separator between source and group ID in external groups */
export const ACL_EXTERNAL_GROUP_SEPARATOR = '::' as const;

/** ACL entry that marks a document as publicly accessible */
export const PUBLIC_DOC_ACL = '__public__' as const;

/**
 * Prefixes a user email to eliminate collision with group names.
 * This applies to both internal (gerts) users and external users.
 */
export function prefixUserEmail(userEmail: string): string {
  return `${ACL_PREFIX_USER_EMAIL}${userEmail}`;
}

/**
 * Prefixes a user group name to eliminate collision with user emails.
 */
export function prefixUserGroup(groupName: string): string {
  return `${ACL_PREFIX_GROUP}${groupName}`;
}

/**
 * Prefixes an external group name to eliminate collision with user emails / internal groups.
 */
export function prefixExternalGroup(extGroupId: string): string {
  return `${ACL_PREFIX_EXTERNAL_GROUP}${extGroupId}`;
}

/**
 * Builds an external group name with source prefix for uniqueness across sources.
 * External groups may collide across sources, so every source needs its own prefix.
 *
 * @param extGroupId - The external group ID from the source system
 * @param source - The connector source type (e.g., 'google_drive', 'confluence')
 * @returns A unique group identifier: `{source}::{extGroupId}` (lowercased)
 */
export function buildExternalGroupId(extGroupId: string, source: string): string {
  return `${source}${ACL_EXTERNAL_GROUP_SEPARATOR}${extGroupId}`.toLowerCase();
}

/**
 * Parses an external group ID to extract source and group ID.
 * @returns Object with source and groupId, or null if invalid format
 */
export function parseExternalGroupId(
  fullGroupId: string,
): { source: string; groupId: string } | null {
  const separatorIndex = fullGroupId.indexOf(ACL_EXTERNAL_GROUP_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }
  return {
    source: fullGroupId.slice(0, separatorIndex),
    groupId: fullGroupId.slice(separatorIndex + ACL_EXTERNAL_GROUP_SEPARATOR.length),
  };
}

// ============================================================================
// ACL Type Definitions (for type predicates)
// ============================================================================

/** ACL entry for user email */
export type UserEmailAcl = `${typeof ACL_PREFIX_USER_EMAIL}${string}`;

/** ACL entry for internal group */
export type GroupAcl = `${typeof ACL_PREFIX_GROUP}${string}`;

/** ACL entry for external group */
export type ExternalGroupAcl = `${typeof ACL_PREFIX_EXTERNAL_GROUP}${string}`;

/** ACL entry for public access */
export type PublicAcl = typeof PUBLIC_DOC_ACL;

/** Union of all valid ACL entry types */
export type AclEntry = UserEmailAcl | GroupAcl | ExternalGroupAcl | PublicAcl;

// ============================================================================
// Type Guards (with proper type predicates)
// ============================================================================

/**
 * Type guard to check if an ACL entry represents a user email.
 * Narrows type to `user_email:${string}` template literal.
 */
export function isUserEmailAcl(acl: string): acl is UserEmailAcl {
  return acl.startsWith(ACL_PREFIX_USER_EMAIL);
}

/**
 * Type guard to check if an ACL entry represents an internal group.
 * Narrows type to `group:${string}` template literal.
 */
export function isGroupAcl(acl: string): acl is GroupAcl {
  return acl.startsWith(ACL_PREFIX_GROUP);
}

/**
 * Type guard to check if an ACL entry represents an external group.
 * Narrows type to `external_group:${string}` template literal.
 */
export function isExternalGroupAcl(acl: string): acl is ExternalGroupAcl {
  return acl.startsWith(ACL_PREFIX_EXTERNAL_GROUP);
}

/**
 * Type guard to check if an ACL entry represents public access.
 * Narrows type to the literal `'__public__'`.
 */
export function isPublicAcl(acl: string): acl is PublicAcl {
  return acl === PUBLIC_DOC_ACL;
}

/**
 * Extracts the value from an ACL entry (removes prefix)
 */
export function extractAclValue(acl: string): string | null {
  if (acl.startsWith(ACL_PREFIX_USER_EMAIL)) {
    return acl.slice(ACL_PREFIX_USER_EMAIL.length);
  }
  if (acl.startsWith(ACL_PREFIX_GROUP)) {
    return acl.slice(ACL_PREFIX_GROUP.length);
  }
  if (acl.startsWith(ACL_PREFIX_EXTERNAL_GROUP)) {
    return acl.slice(ACL_PREFIX_EXTERNAL_GROUP.length);
  }
  if (acl === PUBLIC_DOC_ACL) {
    return PUBLIC_DOC_ACL;
  }
  return null;
}

// ============================================================================
// ExternalAccess Model
// ============================================================================

/** Maximum number of entries in an ExternalAccess to prevent excessively large permission sets */
export const MAX_EXTERNAL_ACCESS_ENTRIES = 5000;

/**
 * Represents the external access permissions for a document/resource.
 * This is what we get from the external source system (e.g., Google Drive, Confluence).
 */
export interface ExternalAccess {
  /** Emails of external users with access to the doc externally */
  readonly externalUserEmails: ReadonlySet<string>;
  /** External IDs of groups with access to the doc (already prefixed with source) */
  readonly externalUserGroupIds: ReadonlySet<string>;
  /** Whether the document is public in the external system */
  readonly isPublic: boolean;
}

/**
 * Creates an ExternalAccess object representing public access.
 */
export function createPublicExternalAccess(): ExternalAccess {
  return {
    externalUserEmails: new Set(),
    externalUserGroupIds: new Set(),
    isPublic: true,
  };
}

/**
 * Creates an empty ExternalAccess object (private, no access).
 * Useful as a fallback when permissions cannot be determined.
 */
export function createEmptyExternalAccess(): ExternalAccess {
  return {
    externalUserEmails: new Set(),
    externalUserGroupIds: new Set(),
    isPublic: false,
  };
}

/**
 * Creates an ExternalAccess object from raw data.
 */
export function createExternalAccess(params: {
  externalUserEmails?: Iterable<string>;
  externalUserGroupIds?: Iterable<string>;
  isPublic?: boolean;
}): ExternalAccess {
  return {
    externalUserEmails: new Set(params.externalUserEmails ?? []),
    externalUserGroupIds: new Set(params.externalUserGroupIds ?? []),
    isPublic: params.isPublic ?? false,
  };
}

/**
 * Returns the number of permission entries in an ExternalAccess
 */
export function getExternalAccessEntryCount(access: ExternalAccess): number {
  return access.externalUserEmails.size + access.externalUserGroupIds.size;
}

/**
 * Checks if an ExternalAccess exceeds the maximum allowed entries
 */
export function isExternalAccessOverLimit(access: ExternalAccess): boolean {
  return getExternalAccessEntryCount(access) > MAX_EXTERNAL_ACCESS_ENTRIES;
}

/**
 * Truncates string representation of a set for logging
 */
function truncateSetString(s: ReadonlySet<string>, maxLen = 100): string {
  const str = JSON.stringify([...s]);
  if (str.length > maxLen) {
    return `${str.slice(0, maxLen)}... (${s.size} items)`;
  }
  return str;
}

/**
 * Creates a string representation of ExternalAccess for logging
 */
export function externalAccessToString(access: ExternalAccess): string {
  return (
    `ExternalAccess(` +
    `externalUserEmails=${truncateSetString(access.externalUserEmails)}, ` +
    `externalUserGroupIds=${truncateSetString(access.externalUserGroupIds)}, ` +
    `isPublic=${access.isPublic})`
  );
}

/**
 * Serializes ExternalAccess to a plain object for storage/transmission
 */
export function externalAccessToJson(access: ExternalAccess): {
  externalUserEmails: string[];
  externalUserGroupIds: string[];
  isPublic: boolean;
} {
  return {
    externalUserEmails: [...access.externalUserEmails],
    externalUserGroupIds: [...access.externalUserGroupIds],
    isPublic: access.isPublic,
  };
}

/**
 * Deserializes ExternalAccess from a plain object
 */
export function externalAccessFromJson(data: {
  externalUserEmails?: string[];
  externalUserGroupIds?: string[];
  isPublic: boolean;
}): ExternalAccess {
  return createExternalAccess({
    externalUserEmails: data.externalUserEmails ?? [],
    externalUserGroupIds: data.externalUserGroupIds ?? [],
    isPublic: data.isPublic,
  });
}

// ============================================================================
// DocExternalAccess Model
// ============================================================================

/**
 * Wraps external access with a document ID.
 * Used for syncing document permissions to the vector store.
 */
export interface DocExternalAccess {
  readonly externalAccess: ExternalAccess;
  readonly docId: string;
}

export function createDocExternalAccess(
  docId: string,
  externalAccess: ExternalAccess,
): DocExternalAccess {
  return { docId, externalAccess };
}

export function docExternalAccessToJson(doc: DocExternalAccess): {
  externalAccess: ReturnType<typeof externalAccessToJson>;
  docId: string;
} {
  return {
    externalAccess: externalAccessToJson(doc.externalAccess),
    docId: doc.docId,
  };
}

export function docExternalAccessFromJson(data: {
  externalAccess: Parameters<typeof externalAccessFromJson>[0];
  docId: string;
}): DocExternalAccess {
  return createDocExternalAccess(data.docId, externalAccessFromJson(data.externalAccess));
}

// ============================================================================
// NodeExternalAccess Model
// ============================================================================

/**
 * Wraps external access with a hierarchy node's raw ID.
 * Used for syncing hierarchy node permissions (e.g., folder permissions).
 */
export interface NodeExternalAccess {
  readonly externalAccess: ExternalAccess;
  /** The raw node ID from the source system (e.g., Google Drive folder ID) */
  readonly rawNodeId: string;
  /** The source type (e.g., "google_drive") */
  readonly source: string;
}

export function createNodeExternalAccess(
  rawNodeId: string,
  source: string,
  externalAccess: ExternalAccess,
): NodeExternalAccess {
  return { rawNodeId, source, externalAccess };
}

export function nodeExternalAccessToJson(node: NodeExternalAccess): {
  externalAccess: ReturnType<typeof externalAccessToJson>;
  rawNodeId: string;
  source: string;
} {
  return {
    externalAccess: externalAccessToJson(node.externalAccess),
    rawNodeId: node.rawNodeId,
    source: node.source,
  };
}

export function nodeExternalAccessFromJson(data: {
  externalAccess: Parameters<typeof externalAccessFromJson>[0];
  rawNodeId: string;
  source: string;
}): NodeExternalAccess {
  return createNodeExternalAccess(
    data.rawNodeId,
    data.source,
    externalAccessFromJson(data.externalAccess),
  );
}

/** Union type for elements that can have permissions synced */
export type ElementExternalAccess = DocExternalAccess | NodeExternalAccess;

// ============================================================================
// DocumentAccess Model
// ============================================================================

/**
 * Complete access model for a document, combining both internal (gerts) permissions
 * and external (source system) permissions.
 *
 * This is the main model used for document access control and filtering.
 */
export interface DocumentAccess {
  /** User emails for internal gerts users with access */
  readonly userEmails: ReadonlySet<string>;
  /** Names of internal user groups with access */
  readonly userGroups: ReadonlySet<string>;
  /** Emails of external users with access */
  readonly externalUserEmails: ReadonlySet<string>;
  /** External group IDs with access (source-prefixed) */
  readonly externalUserGroupIds: ReadonlySet<string>;
  /** Whether the document is publicly accessible */
  readonly isPublic: boolean;
}

/**
 * Creates a DocumentAccess object from raw data.
 * Don't prefix incoming data with ACL type - prefixing happens in toAcl()!
 */
export function createDocumentAccess(params: {
  userEmails?: Iterable<string | null>;
  userGroups?: Iterable<string>;
  externalUserEmails?: Iterable<string>;
  externalUserGroupIds?: Iterable<string>;
  isPublic?: boolean;
}): DocumentAccess {
  // Filter out null values from userEmails
  const userEmails = new Set<string>();
  for (const email of params.userEmails ?? []) {
    if (email) userEmails.add(email);
  }

  return {
    userEmails,
    userGroups: new Set(params.userGroups ?? []),
    externalUserEmails: new Set(params.externalUserEmails ?? []),
    externalUserGroupIds: new Set(params.externalUserGroupIds ?? []),
    isPublic: params.isPublic ?? false,
  };
}

/**
 * Creates a public DocumentAccess (accessible to everyone).
 */
export function createPublicDocumentAccess(): DocumentAccess {
  return createDocumentAccess({ isPublic: true });
}

/**
 * Converts the DocumentAccess state to a set of formatted ACL strings.
 *
 * This is the key method for converting structured permissions into
 * a flat set of strings that can be stored in a vector index and
 * used for efficient filtering at query time.
 *
 * NOTE: When querying for documents, the supplied ACL filter strings must
 * be formatted in the same way as this function.
 */
export function documentAccessToAcl(access: DocumentAccess): Set<string> {
  const aclSet = new Set<string>();

  // Add internal user emails
  for (const userEmail of access.userEmails) {
    aclSet.add(prefixUserEmail(userEmail));
  }

  // Add internal user groups
  for (const groupName of access.userGroups) {
    aclSet.add(prefixUserGroup(groupName));
  }

  // Add external user emails (same prefix as internal for query efficiency)
  for (const externalUserEmail of access.externalUserEmails) {
    aclSet.add(prefixUserEmail(externalUserEmail));
  }

  // Add external groups
  for (const externalGroupId of access.externalUserGroupIds) {
    aclSet.add(prefixExternalGroup(externalGroupId));
  }

  // Add public marker if applicable
  if (access.isPublic) {
    aclSet.add(PUBLIC_DOC_ACL);
  }

  return aclSet;
}

/**
 * Builds the ACL set for a user based on their identity and group memberships.
 * This is used at query time to filter documents.
 *
 * @param userEmail - The user's email address
 * @param userGroups - Internal group names the user belongs to
 * @param externalGroupIds - External group IDs the user is mapped to (source-prefixed)
 * @param includePublic - Whether to include public document access (default: true)
 */
export function buildUserAcl(params: {
  userEmail: string;
  userGroups?: Iterable<string>;
  externalGroupIds?: Iterable<string>;
  includePublic?: boolean;
}): Set<string> {
  const aclSet = new Set<string>();

  // User's own email
  aclSet.add(prefixUserEmail(params.userEmail));

  // User's internal groups
  for (const group of params.userGroups ?? []) {
    aclSet.add(prefixUserGroup(group));
  }

  // User's external group mappings
  for (const extGroupId of params.externalGroupIds ?? []) {
    aclSet.add(prefixExternalGroup(extGroupId));
  }

  // Public access (included by default)
  if (params.includePublic !== false) {
    aclSet.add(PUBLIC_DOC_ACL);
  }

  return aclSet;
}

/**
 * Checks if a user can access a document based on ACL intersection.
 * Returns true if there's any overlap between user ACL and document ACL.
 */
export function canAccessDocument(
  userAcl: ReadonlySet<string>,
  documentAcl: ReadonlySet<string>,
): boolean {
  for (const acl of userAcl) {
    if (documentAcl.has(acl)) {
      return true;
    }
  }
  return false;
}

/**
 * Serializes DocumentAccess to JSON
 */
export function documentAccessToJson(access: DocumentAccess): {
  userEmails: string[];
  userGroups: string[];
  externalUserEmails: string[];
  externalUserGroupIds: string[];
  isPublic: boolean;
} {
  return {
    userEmails: [...access.userEmails],
    userGroups: [...access.userGroups],
    externalUserEmails: [...access.externalUserEmails],
    externalUserGroupIds: [...access.externalUserGroupIds],
    isPublic: access.isPublic,
  };
}

/**
 * Deserializes DocumentAccess from JSON
 */
export function documentAccessFromJson(data: {
  userEmails?: string[];
  userGroups?: string[];
  externalUserEmails?: string[];
  externalUserGroupIds?: string[];
  isPublic: boolean;
}): DocumentAccess {
  return createDocumentAccess({
    userEmails: data.userEmails ?? [],
    userGroups: data.userGroups ?? [],
    externalUserEmails: data.externalUserEmails ?? [],
    externalUserGroupIds: data.externalUserGroupIds ?? [],
    isPublic: data.isPublic,
  });
}

/**
 * Creates a DocumentAccess from an ExternalAccess plus internal permissions.
 * This is used when combining synced external permissions with internal group assignments.
 */
export function mergeExternalAccessWithInternal(
  externalAccess: ExternalAccess,
  internalAccess?: {
    userEmails?: Iterable<string>;
    userGroups?: Iterable<string>;
  },
): DocumentAccess {
  const userEmails = internalAccess?.userEmails;
  const userGroups = internalAccess?.userGroups;
  return createDocumentAccess({
    externalUserEmails: externalAccess.externalUserEmails,
    externalUserGroupIds: externalAccess.externalUserGroupIds,
    isPublic: externalAccess.isPublic,
    ...(userEmails !== undefined && { userEmails }),
    ...(userGroups !== undefined && { userGroups }),
  });
}
