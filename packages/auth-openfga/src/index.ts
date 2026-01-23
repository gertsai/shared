/**
 * @gerts/auth-openfga
 *
 * OpenFGA integration for gerts.ai authorization.
 * Supports RBAC + ReBAC + ABAC (Zanzibar-style).
 *
 * @example Standard RBAC/ReBAC check
 * ```typescript
 * import { getFgaClient, checkPermission, canView, canEdit } from '@gerts/auth-openfga';
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
 * import { checkPermission, buildABACContext } from '@gerts/auth-openfga';
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

// Client
export { GertsFgaClient, getFgaClient, resetFgaClient } from './client.js';

// Types
export type {
  FgaResourceType,
  FgaRelations,
  FgaPermission,
  FgaAccessLevel,
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
} from './types.js';

// ABAC constants
export { CLEARANCE_LEVELS, RESOURCE_STATUS, BLOCKED_COUNTRIES_OFAC } from './types.js';

// ABAC utilities
export {
  buildABACContext,
  buildTimeContext,
  buildNetworkContext,
  buildGeoContext,
  buildResourceContext,
  extractClientIp,
  extractCountryCode,
  isValidIp,
  isWithinBusinessHours,
  isClearanceSufficient,
  isCountryAllowed,
  preCheckABAC,
  DEFAULT_ABAC_POLICY,
} from './abac.js';

export type { ABACRequestInfo, ABACResourceInfo, ABACPolicy } from './abac.js';

// Constants
export {
  FGA_TYPES,
  FGA_RELATIONS,
  FGA_DEFAULT_CONFIG,
  METHOD_TO_RELATION,
  ACTION_TO_RELATION,
  userString,
  teamMemberString,
  roleAssigneeString,
  objectString,
  parseObjectString,
  parseUserString,
} from './constants.js';

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
} from './mutations/index.js';
