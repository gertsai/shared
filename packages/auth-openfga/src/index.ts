/**
 * @gertsai/auth-openfga
 *
 * OpenFGA integration for gerts.ai authorization.
 * Supports RBAC + ReBAC + ABAC (Zanzibar-style).
 *
 * @example Standard RBAC/ReBAC check
 * ```typescript
 * import { getFgaClient, checkPermission, canView, canEdit } from '@gertsai/auth-openfga';
 *
 * // Check permission
 * const allowed = await checkPermission({
 *   userId: '123',
 *   relation: 'viewer',
 *   resourceType: 'project',
 *   resourceId: 'demo',
 * });
 *
 * // Convenience methods
 * const canViewProject = await canView('123', 'project', 'demo');
 * const canEditProject = await canEdit('123', 'project', 'demo');
 * ```
 *
 * @example ABAC check with context
 * ```typescript
 * import { checkPermission, buildABACContext } from '@gertsai/auth-openfga';
 *
 * // Build context from HTTP request
 * const context = buildABACContext(req, {
 *   resource: { sensitivity: 2, status: 'active' },
 *   policy: { allowedCidrs: ['10.0.0.0/8'] },
 * });
 *
 * // Check with ABAC
 * const allowed = await checkPermission({
 *   userId: '123',
 *   relation: 'can_view',
 *   resourceType: 'sensitive_project',
 *   resourceId: 'secret',
 *   context,
 * });
 * ```
 */

// Client (Wave 6.3 / ADR-012: + createFgaClient for non-cached factory)
export {
  GertsFgaClient,
  getFgaClient,
  createFgaClient,
  resetFgaClient,
} from './client.js';
export { fingerprint, DEFAULT_FINGERPRINT } from './util/fingerprint.js';

// Types
export type {
  FgaResourceType,
  FgaRelations,
  FgaPermission,
  FgaAccessLevel,
  // Type-safe OpenFGA generics (RFC-055)
  CheckableResourceType,
  RelationFor,
  TypedOpenFgaCheck,
  StaticOpenFgaCheck,
  FgaTuple,
  FgaTupleKey,
  FgaWriteRequest,
  FgaCheckRequest,
  FgaCheckResponse,
  FgaListObjectsRequest,
  FgaListUsersRequest,
  FgaExpandRequest,
  FgaExpandNode,
  FgaClientConfig,
  FgaResolvedConfig,
  IamEventType,
  MembershipEventPayload,
  RoleAssignmentPayload,
  // ABAC types
  ABACContext,
  ABACTimeContext,
  ABACNetworkContext,
  ABACGeoContext,
  ABACResourceContext,
  ClearanceLevel,
  ResourceStatus,
  // Trusted Proxy types (SEC-006)
  TrustedProxyConfig,
} from './types.js';

// ABAC constants
export {
  CLEARANCE_LEVELS,
  RESOURCE_STATUS,
  BLOCKED_COUNTRIES_OFAC,
  createOpenFgaCheck,
} from './types.js';

// ABAC utilities
export {
  buildABACContext,
  buildTimeContext,
  buildNetworkContext,
  buildGeoContext,
  buildResourceContext,
  extractClientIp,
  extractCountryCode,
  // Legacy (deprecated)
  extractClientIpUnsafe,
  extractCountryCodeUnsafe,
  isValidIp,
  isWithinBusinessHours,
  isClearanceSufficient,
  isCountryAllowed,
  preCheckABAC,
  DEFAULT_ABAC_POLICY,
  // Trusted proxy utilities (SEC-006)
  isTrustedProxy,
  isCloudflareIp,
  DEFAULT_TRUSTED_PROXIES,
} from './abac.js';

export type { ABACRequestInfo, ABACResourceInfo, ABACPolicy } from './abac.js';

// Cloudflare IP ranges (SEC-006)
export {
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
  PRIVATE_IP_RANGES,
  isIpInCidr,
} from './cloudflare-ips.js';

// Constants
export {
  FGA_TYPES,
  FGA_RELATIONS,
  FGA_DEFAULT_CONFIG,
  METHOD_TO_RELATION,
  ACTION_TO_RELATION,
  // Subject helpers (SEC-009)
  subjectString,
  apiKeyString,
  userString,
  teamMemberString,
  roleAssigneeString,
  objectString,
  parseObjectString,
  parseUserString,
} from './constants.js';

// Subject types (SEC-009)
export type { SubjectType } from './constants.js';

// Queries
export {
  checkPermission,
  canView,
  canEdit,
  canDelete,
  canManage,
  canExecuteQuery,
  batchCheckPermissions,
  listAccessibleResources,
  listViewableProjects,
  listEditableProjects,
  listUserTeams,
  listUserTenants,
  listUsersWithAccess,
  listProjectViewers,
  listProjectEditors,
  listProjectAdmins,
  listTeamMembers,
  getAccessSummary,
  // Explain operations (B2.3)
  expandPermission,
  explainAccess,
} from './queries/index.js';

// Mutations
export {
  writeTuples,
  deleteTuples,
  writeTransaction,
  onUserCreated,
  onUserDeleted,
  onMembershipAdded,
  onMembershipRemoved,
  onRoleAssigned,
  onRoleUnassigned,
  onTeamMemberAdded,
  onTeamMemberRemoved,
  setTeamParent,
  grantTeamProjectAccess,
  grantRoleProjectAccess,
  setProjectTenant,
  onApiKeyCreated,
  onApiKeyDeleted,
  // Bulk Operations (B3.2)
  bulkGrantAccess,
  bulkRevokeAccess,
  bulkGrantToResources,
  bulkRevokeFromResources,
  bulkWriteTuples,
  bulkDeleteTuples,
} from './mutations/index.js';

export type { BulkOperationOptions, BulkOperationResult } from './mutations/index.js';

// Deny Layer (B3.1: Instant Revoke)
export {
  denyAccess,
  restoreAccess,
  isDenied,
  listDeniedAccess,
  getDenyLedger,
  setDenyLedger,
  resetDenyLedger,
  InMemoryDenyLedger,
  RedisDenyLedgerAdapter,
} from './deny/index.js';

export type {
  DenyEntry,
  DenyCheckRequest,
  DenyCheckResult,
  DenyLedger,
  RedisDenyLedgerAdapterConfig,
} from './deny/index.js';

// Permission Cache (B3.3: Event-Driven Invalidation)
export {
  PermissionCache,
  getPermissionCache,
  setPermissionCache,
  resetPermissionCache,
  createInvalidationHandler,
  INVALIDATION_EVENTS,
} from './cache/index.js';

export type {
  PermissionCacheKey,
  PermissionCacheConfig,
  PermissionChangeEvent,
} from './cache/index.js';
