/**
 * OpenFGA Types for gerts.ai
 * Based on: infra/openfga/model.fga
 *
 * Supports RBAC + ReBAC + ABAC authorization:
 * - RBAC: role-based access via role assignments
 * - ReBAC: relationship-based access via team/project hierarchy
 * - ABAC: attribute-based access via contextual conditions
 */

// =============================================================================
// Resource Types (from model.fga)
// =============================================================================

/**
 * All resource types defined in OpenFGA model.
 * Maps to `type X` declarations in model.fga
 */
export type FgaResourceType =
  | 'user'
  | 'tenant'
  | 'role'
  | 'team'
  | 'project'
  | 'sensitive_project' // High-security project with mandatory ABAC
  | 'entity'
  | 'query'
  | 'api_key'
  | 'document'; // Document with sensitivity levels

// =============================================================================
// ABAC Context Types
// =============================================================================

/**
 * Time-based ABAC context.
 * Used for business hours and time-restricted access.
 */
export interface ABACTimeContext {
  /** Current timestamp (ISO 8601 format) */
  current_time: string;
  /** Current hour (0-23 UTC) - for local pre-checks without parsing timestamp */
  current_hour?: number;
}

/**
 * Network-based ABAC context.
 * Used for IP whitelisting and CIDR range checks.
 */
export interface ABACNetworkContext {
  /** User's IP address */
  user_ip: string;
  /** Allowed CIDR ranges (e.g., ["10.0.0.0/8", "192.168.0.0/16"]) */
  allowed_cidrs?: string[];
  /** IP whitelist */
  whitelist?: string[];
}

/**
 * Geo-location ABAC context.
 * Used for country/region-based access control.
 */
export interface ABACGeoContext {
  /** User's country code (ISO 3166-1 alpha-2, e.g., "US", "DE") */
  user_country: string;
  /** Allowed country codes */
  allowed_countries?: string[];
  /** Blocked country codes (sanctions, etc.) */
  blocked_countries?: string[];
}

/**
 * Resource attribute ABAC context.
 * Used for sensitivity levels and resource status checks.
 */
export interface ABACResourceContext {
  /** User's security clearance level (0=public, 1=internal, 2=confidential, 3=secret) */
  user_clearance?: number;
  /** Resource sensitivity level */
  resource_sensitivity?: number;
  /** Resource status (active, archived, deleted) */
  resource_status?: string;
}

/**
 * Combined ABAC context for all conditions.
 * Pass to check() for attribute-based authorization.
 *
 * @example
 * ```typescript
 * const context: ABACContext = {
 *   current_time: new Date().toISOString(),
 *   user_ip: req.ip,
 *   user_country: 'US',
 *   allowed_cidrs: ['10.0.0.0/8'],
 *   user_clearance: 2,
 *   resource_sensitivity: 1,
 *   resource_status: 'active',
 * };
 *
 * const result = await checkPermission({
 *   userId: 'alice',
 *   relation: 'can_view',
 *   resourceType: 'sensitive_project',
 *   resourceId: 'project-123',
 *   context,
 * });
 * ```
 */
export interface ABACContext
  extends
    Partial<ABACTimeContext>,
    Partial<ABACNetworkContext>,
    Partial<ABACGeoContext>,
    Partial<ABACResourceContext> {}

/**
 * Security clearance levels for ABAC.
 */
export const CLEARANCE_LEVELS = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
} as const;

export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[keyof typeof CLEARANCE_LEVELS];

// =============================================================================
// Trusted Proxy Configuration (SEC-006: IP/Geo spoofing prevention)
// =============================================================================

/**
 * Configuration for trusted proxy validation.
 * Used to securely extract client IP and geo data.
 *
 * @example
 * ```typescript
 * const config: TrustedProxyConfig = {
 *   trustedProxies: ['10.0.0.0/8', ...CLOUDFLARE_IPV4_RANGES],
 *   trustedGeoHeaders: ['cf-ipcountry'],
 * };
 * ```
 */
export interface TrustedProxyConfig {
  /** CIDR ranges of trusted proxy servers (e.g., Cloudflare, internal LBs) */
  trustedProxies: string[];
  /** Headers to trust for geo-location (only from trusted proxies) */
  trustedGeoHeaders: 'cf-ipcountry'[];
}

/**
 * Resource status values for ABAC.
 */
export const RESOURCE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const;

export type ResourceStatus = (typeof RESOURCE_STATUS)[keyof typeof RESOURCE_STATUS];

/**
 * Common blocked countries for sanctions compliance.
 */
export const BLOCKED_COUNTRIES_OFAC = ['CU', 'IR', 'KP', 'SY', 'RU'] as const;

/**
 * Relations for each resource type.
 * Maps to `define X: [...]` in model.fga
 */
export interface FgaRelations {
  tenant: 'member' | 'admin';
  role: 'assignee' | 'can_manage' | 'parent_role';
  team: 'member' | 'lead' | 'admin' | 'parent' | 'inherited_member';
  // Standard project (optional ABAC)
  project:
    | 'tenant'
    | 'viewer'
    | 'editor'
    | 'admin'
    | 'viewer_business_hours' // ABAC: time-restricted
    | 'editor_business_hours'
    | 'viewer_secure' // ABAC: network-restricted
    | 'editor_secure'
    | 'viewer_geo' // ABAC: geo-restricted
    | 'viewer_full_secure' // ABAC: time + network
    | 'can_view'
    | 'can_edit'
    | 'can_delete'
    | 'can_manage';
  // Sensitive project (mandatory ABAC)
  sensitive_project:
    | 'tenant'
    | 'viewer'
    | 'editor'
    | 'admin'
    | 'cleared_viewer' // ABAC: clearance-based
    | 'cleared_editor'
    | 'can_view'
    | 'can_edit'
    | 'can_delete'
    | 'can_manage';
  entity:
    | 'project'
    | 'viewer'
    | 'editor'
    | 'admin'
    | 'sensitive_viewer'
    | 'can_view'
    | 'can_edit'
    | 'can_delete';
  query: 'project' | 'executor' | 'executor_business_hours' | 'can_execute';
  api_key: 'owner' | 'tenant' | 'owner_secure' | 'can_view' | 'can_revoke' | 'can_rotate';
  // Document with sensitivity levels
  document:
    | 'project'
    | 'viewer'
    | 'editor'
    | 'admin'
    | 'cleared_viewer' // ABAC: clearance-based
    | 'cleared_editor'
    | 'active_viewer' // ABAC: status-based
    | 'can_view'
    | 'can_edit'
    | 'can_delete';
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

// =============================================================================
// Type-Safe Generics for OpenFGA Check (RFC-055)
// =============================================================================

/**
 * Resource types that support permission checks.
 * Excludes 'user' which is primarily a subject, not a resource.
 */
export type CheckableResourceType = Exclude<FgaResourceType, 'user'>;

/**
 * Extract valid relations for a specific resource type.
 * Falls back to string for unknown resource types.
 *
 * @example
 * type ProjectRelations = RelationFor<'project'>;
 * // => 'viewer' | 'editor' | 'admin' | 'can_view' | ...
 */
export type RelationFor<T extends FgaResourceType> = T extends keyof FgaRelations
  ? FgaRelations[T]
  : string;

/**
 * Type-safe OpenFGA check configuration.
 *
 * Provides:
 * - IDE autocomplete for resourceType (from FgaResourceType)
 * - IDE autocomplete for relation (based on resourceType via FgaRelations)
 * - IDE autocomplete for resourceIdFromParams (based on ParamsType keys)
 *
 * @template ResourceType - The OpenFGA resource type
 * @template ParamsType - The action params type (for extracting valid param keys)
 *
 * @example
 * ```typescript
 * // Full type safety:
 * openFgaCheck: {
 *   resourceType: 'project',        // <- autocomplete: 'project' | 'team' | ...
 *   relation: 'can_view',           // <- autocomplete: only valid for 'project'
 *   resourceIdFromParams: 'id',     // <- autocomplete: keys from ParamsType
 * }
 * ```
 */
export type TypedOpenFgaCheck<
  ResourceType extends CheckableResourceType = CheckableResourceType,
  ParamsType extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Resource type in OpenFGA model.
   * @see infra/openfga/model.fga
   */
  resourceType: ResourceType;

  /**
   * Relation to check - only valid relations for this resourceType are shown.
   * Typically use permission relations: can_view, can_edit, can_delete, etc.
   */
  relation: RelationFor<ResourceType>;

  /**
   * Parameter name containing the resource ID.
   * Only keys from ParamsType are allowed.
   */
  resourceIdFromParams: Extract<keyof ParamsType, string>;
};

/**
 * OpenFGA check config with static resource ID.
 * Use when resource ID is known at compile time (rare case).
 */
export type StaticOpenFgaCheck<ResourceType extends CheckableResourceType = CheckableResourceType> =
  {
    resourceType: ResourceType;
    relation: RelationFor<ResourceType>;
    /** Static resource ID (use instead of resourceIdFromParams) */
    resourceId: string;
  };

/**
 * Helper to create type-safe OpenFGA check.
 * Use when you want explicit typing without inline type annotations.
 *
 * @example
 * ```typescript
 * const check = createOpenFgaCheck<'project', { id: string }>({
 *   resourceType: 'project',
 *   relation: 'can_view',
 *   resourceIdFromParams: 'id', // <- must be keyof { id: string }
 * });
 * ```
 */
export function createOpenFgaCheck<
  ResourceType extends CheckableResourceType,
  ParamsType extends Record<string, unknown>,
>(
  config: TypedOpenFgaCheck<ResourceType, ParamsType>,
): TypedOpenFgaCheck<ResourceType, ParamsType> {
  return config;
}

/**
 * Role relations that represent access levels.
 */
export type FgaAccessLevel =
  | 'viewer'
  | 'editor'
  | 'admin'
  | 'member'
  | 'lead'
  | 'assignee'
  | 'executor'
  | 'owner';

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
 *
 * @example Standard check (RBAC/ReBAC only)
 * ```typescript
 * const request: FgaCheckRequest = {
 *   userId: 'alice',
 *   relation: 'can_view',
 *   resourceType: 'project',
 *   resourceId: 'demo',
 * };
 * ```
 *
 * @example Check with ABAC context
 * ```typescript
 * const request: FgaCheckRequest = {
 *   userId: 'alice',
 *   relation: 'can_view',
 *   resourceType: 'sensitive_project',
 *   resourceId: 'secret-project',
 *   context: {
 *     current_time: new Date().toISOString(),
 *     user_ip: '10.0.1.50',
 *     allowed_cidrs: ['10.0.0.0/8'],
 *     user_country: 'US',
 *     blocked_countries: ['RU', 'KP'],
 *     user_clearance: 2,
 *     resource_sensitivity: 1,
 *   },
 * };
 * ```
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
  /**
   * ABAC context for conditional authorization.
   * Required for ABAC-enabled relations (e.g., viewer_secure, cleared_viewer).
   */
  context?: ABACContext;
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
  /** ABAC context for conditional filtering */
  context?: ABACContext;
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
  /**
   * Pre-shared bearer token for OpenFGA `--authn-method=preshared`
   * deployments (Wave 6.2 / RFC-003).
   *
   * When set, plumbed straight through to the underlying `@openfga/sdk`
   * `OpenFgaClient` as
   * `credentials: { method: ApiToken, config: { token: <apiToken> } }`.
   * When unset, no `credentials` are passed and the SDK runs anonymously
   * (the existing default behaviour, preserved for backwards compat).
   *
   * SECURITY: never log this value. The SDK includes it in
   * `Authorization: Bearer ...` headers; treat as secret in transit.
   */
  apiToken?: string;
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
  /**
   * Echoed from {@link FgaClientConfig.apiToken} so callers can confirm
   * the token was accepted (NOT for logging — see security note on the
   * input field).
   */
  apiToken?: string;
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
  tenantId?: string;
  grantedBy?: string;
}
