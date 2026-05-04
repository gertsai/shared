/**
 * OpenFGA Constants for gerts.ai
 * Based on: infra/openfga/model.fga
 */

// =============================================================================
// Resource Type Constants
// =============================================================================

export const FGA_TYPES = {
  USER: 'user',
  TENANT: 'tenant',
  ROLE: 'role',
  TEAM: 'team',
  PROJECT: 'project',
  ENTITY: 'entity',
  QUERY: 'query',
  API_KEY: 'api_key',
} as const;

// =============================================================================
// Relation Constants
// =============================================================================

export const FGA_RELATIONS = {
  // Common
  MEMBER: 'member',
  ADMIN: 'admin',
  OWNER: 'owner',

  // Access levels
  VIEWER: 'viewer',
  EDITOR: 'editor',
  LEAD: 'lead',
  ASSIGNEE: 'assignee',
  EXECUTOR: 'executor',

  // Permissions
  CAN_VIEW: 'can_view',
  CAN_EDIT: 'can_edit',
  CAN_DELETE: 'can_delete',
  CAN_MANAGE: 'can_manage',
  CAN_EXECUTE: 'can_execute',
  CAN_REVOKE: 'can_revoke',
  CAN_ROTATE: 'can_rotate',

  // Hierarchy
  PARENT: 'parent',
  PARENT_ROLE: 'parent_role',
  INHERITED_MEMBER: 'inherited_member',
  TENANT: 'tenant',
  PROJECT: 'project',
} as const;

// =============================================================================
// Default Configuration
// =============================================================================

export const FGA_DEFAULT_CONFIG = {
  /** Default OpenFGA API URL */
  apiUrl: process.env.OPENFGA_API_URL || 'http://localhost:8080',

  /** Default store name */
  storeName: 'gerts',

  /** Request timeout in ms */
  timeout: 5000,

  /** Retry configuration */
  retry: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
  },
};

// =============================================================================
// Permission Mappings
// =============================================================================

/**
 * Maps HTTP methods to required OpenFGA relations.
 */
export const METHOD_TO_RELATION: Record<string, string> = {
  GET: FGA_RELATIONS.CAN_VIEW,
  HEAD: FGA_RELATIONS.CAN_VIEW,
  POST: FGA_RELATIONS.CAN_EDIT,
  PUT: FGA_RELATIONS.CAN_EDIT,
  PATCH: FGA_RELATIONS.CAN_EDIT,
  DELETE: FGA_RELATIONS.CAN_DELETE,
};

/**
 * Maps action types to required OpenFGA relations.
 */
export const ACTION_TO_RELATION: Record<string, string> = {
  read: FGA_RELATIONS.CAN_VIEW,
  list: FGA_RELATIONS.CAN_VIEW,
  create: FGA_RELATIONS.CAN_EDIT,
  update: FGA_RELATIONS.CAN_EDIT,
  delete: FGA_RELATIONS.CAN_DELETE,
  manage: FGA_RELATIONS.CAN_MANAGE,
  execute: FGA_RELATIONS.CAN_EXECUTE,
};

// =============================================================================
// Subject Types (SEC-009: Explicit subject type for correct authorization)
// =============================================================================

/**
 * Subject types for OpenFGA authorization checks.
 *
 * CRITICAL: IAM event sourcing writes tuples with specific subject types.
 * Authorization checks MUST use the same subject type as the written tuples.
 *
 * @example
 * IAM writes: user:USER-123 → viewer → project:P1
 * Check must use: subjectString('user', 'USER-123')
 * NOT: subjectString('user', 'KEY-ABC') ← This would never match!
 */
export type SubjectType = 'user' | 'api_key' | 'team' | 'tenant' | 'role';

/**
 * Creates a subject string with explicit type.
 * Use this for all OpenFGA authorization checks.
 *
 * @example subjectString('user', '123') → 'user:123'
 * @example subjectString('api_key', 'abc') → 'api_key:abc'
 */
export function subjectString(type: SubjectType, id: string): string {
  return `${type}:${id}`;
}

// =============================================================================
// Tuple Helpers
// =============================================================================

/**
 * Creates a user string for OpenFGA.
 * @example userString('123') → 'user:123'
 */
export function userString(userId: string): string {
  return `${FGA_TYPES.USER}:${userId}`;
}

/**
 * Creates an api_key string for OpenFGA.
 * Use when the subject is the API key itself (not the owner).
 *
 * @example apiKeyString('key-abc') → 'api_key:key-abc'
 */
export function apiKeyString(keyId: string): string {
  return `${FGA_TYPES.API_KEY}:${keyId}`;
}

/**
 * Creates a team member string for OpenFGA.
 * @example teamMemberString('alpha') → 'team:alpha#member'
 */
export function teamMemberString(teamId: string): string {
  return `${FGA_TYPES.TEAM}:${teamId}#${FGA_RELATIONS.MEMBER}`;
}

/**
 * Creates a role assignee string for OpenFGA.
 * @example roleAssigneeString('admin') → 'role:admin#assignee'
 */
export function roleAssigneeString(roleId: string): string {
  return `${FGA_TYPES.ROLE}:${roleId}#${FGA_RELATIONS.ASSIGNEE}`;
}

/**
 * Creates an object string for OpenFGA.
 * @example objectString('project', 'demo') → 'project:demo'
 */
export function objectString(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * Parses an object string into type and id.
 * @example parseObjectString('project:demo') → { type: 'project', id: 'demo' }
 */
export function parseObjectString(object: string): { type: string; id: string } {
  const [type, ...rest] = object.split(':');
  return { type, id: rest.join(':') };
}

/**
 * Parses a user string to extract user type and id.
 * @example parseUserString('user:123') → { type: 'user', id: '123' }
 * @example parseUserString('team:alpha#member') → { type: 'team', id: 'alpha', relation: 'member' }
 */
export function parseUserString(user: string): { type: string; id: string; relation?: string } {
  if (user.includes('#')) {
    const [typeId, relation] = user.split('#');
    const { type, id } = parseObjectString(typeId);
    return { type, id, relation };
  }
  return parseObjectString(user);
}
