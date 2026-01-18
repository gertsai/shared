/**
 * OpenFGA Types for gerts.ai
 * Based on: infra/openfga/model.fga
 */

// =============================================================================
// Resource Types (from model.fga)
// =============================================================================

/**
 * All resource types defined in OpenFGA model.
 * Maps to `type X` declarations in model.fga
 */
export type FgaResourceType = 'user' | 'tenant' | 'role' | 'team' | 'project' | 'entity' | 'query' | 'api_key';

/**
 * Relations for each resource type.
 * Maps to `define X: [...]` in model.fga
 */
export interface FgaRelations {
  tenant: 'member' | 'admin';
  role: 'assignee' | 'can_manage' | 'parent_role';
  team: 'member' | 'lead' | 'admin' | 'parent' | 'inherited_member';
  project: 'tenant' | 'viewer' | 'editor' | 'admin' | 'can_view' | 'can_edit' | 'can_delete' | 'can_manage';
  entity: 'project' | 'viewer' | 'editor' | 'admin' | 'can_view' | 'can_edit' | 'can_delete';
  query: 'project' | 'executor' | 'can_execute';
  api_key: 'owner' | 'tenant' | 'can_view' | 'can_revoke' | 'can_rotate';
}

/**
 * Permission relations (can_*) that can be checked.
 */
export type FgaPermission =
  | 'can_view'
  | 'can_edit'
  | 'can_delete'
  | 'can_manage'
  | 'can_execute'
  | 'can_revoke'
  | 'can_rotate';

/**
 * Role relations that represent access levels.
 */
export type FgaAccessLevel = 'viewer' | 'editor' | 'admin' | 'member' | 'lead' | 'assignee' | 'executor' | 'owner';

// =============================================================================
// Tuple Types
// =============================================================================

/**
 * OpenFGA tuple: subject → relation → object
 */
export interface FgaTuple {
  /** Subject (e.g., "user:123", "team:alpha#member") */
  user: string;
  /** Relation (e.g., "viewer", "editor") */
  relation: string;
  /** Object (e.g., "project:demo") */
  object: string;
}

/**
 * Tuple key for write/delete operations.
 */
export interface FgaTupleKey {
  user: string;
  relation: string;
  object: string;
}

/**
 * Batch write operation.
 */
export interface FgaWriteRequest {
  writes?: FgaTupleKey[];
  deletes?: FgaTupleKey[];
}

// =============================================================================
// Check Types
// =============================================================================

/**
 * Check request: "Can user X do relation Y on object Z?"
 */
export interface FgaCheckRequest {
  /** User ID (will be prefixed with "user:") */
  userId: string;
  /** Relation to check (e.g., "viewer", "can_edit") */
  relation: string;
  /** Resource type */
  resourceType: FgaResourceType;
  /** Resource ID */
  resourceId: string;
  /** Optional context for ABAC conditions */
  context?: Record<string, unknown>;
}

/**
 * Check response.
 */
export interface FgaCheckResponse {
  allowed: boolean;
  /** Resolution path if allowed (for debugging) */
  resolution?: string;
}

// =============================================================================
// List Types
// =============================================================================

/**
 * List objects request: "What objects can user X access with relation Y?"
 */
export interface FgaListObjectsRequest {
  /** User ID */
  userId: string;
  /** Relation to filter by */
  relation: string;
  /** Resource type to list */
  resourceType: FgaResourceType;
  /** Optional context */
  context?: Record<string, unknown>;
}

/**
 * List users request: "Who has relation Y on object Z?"
 */
export interface FgaListUsersRequest {
  /** Resource type */
  resourceType: FgaResourceType;
  /** Resource ID */
  resourceId: string;
  /** Relation to filter by */
  relation: string;
}

// =============================================================================
// Expand Types
// =============================================================================

/**
 * Expand request: "Why does user X have relation Y on object Z?"
 */
export interface FgaExpandRequest {
  /** Relation to expand */
  relation: string;
  /** Resource type */
  resourceType: FgaResourceType;
  /** Resource ID */
  resourceId: string;
}

/**
 * Expand response tree node.
 */
export interface FgaExpandNode {
  type: 'leaf' | 'union' | 'intersection' | 'exclusion';
  users?: string[];
  children?: FgaExpandNode[];
  computed?: string;
}

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * OpenFGA client configuration.
 */
export interface FgaClientConfig {
  /** API URL (default: http://localhost:8080) */
  apiUrl?: string;
  /** Store ID (will be fetched/created if not provided) */
  storeId?: string;
  /** Authorization model ID (will be fetched if not provided) */
  authorizationModelId?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
  };
}

/**
 * Resolved client configuration after initialization.
 */
export interface FgaResolvedConfig {
  apiUrl: string;
  storeId: string;
  authorizationModelId: string;
  timeout: number;
}

// =============================================================================
// Event Types (for Event Sourcing sync)
// =============================================================================

/**
 * IAM events that trigger OpenFGA sync.
 */
export type IamEventType =
  | 'iam.user.created'
  | 'iam.user.deleted'
  | 'iam.membership.added'
  | 'iam.membership.removed'
  | 'iam.role.assigned'
  | 'iam.role.unassigned'
  | 'iam.team.member_added'
  | 'iam.team.member_removed'
  | 'iam.project.access_granted'
  | 'iam.project.access_revoked';

/**
 * Payload for membership events.
 */
export interface MembershipEventPayload {
  userId: string;
  resourceType: FgaResourceType;
  resourceId: string;
  relation: FgaAccessLevel;
  grantedBy?: string;
  reason?: string;
}

/**
 * Payload for role assignment events.
 */
export interface RoleAssignmentPayload {
  userId: string;
  roleId: string;
  tenantId: string;
  grantedBy?: string;
}
