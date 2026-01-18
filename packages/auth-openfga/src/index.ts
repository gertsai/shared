/**
 * @gerts/auth-openfga
 *
 * OpenFGA integration for gerts.ai authorization (Zanzibar-style ReBAC).
 *
 * @example
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
 *
 * // Direct client access
 * const client = getFgaClient();
 * await client.grantAccess('123', 'viewer', 'project', 'demo');
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
} from './types.js';

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
