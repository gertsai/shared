/**
 * OpenFGA Query Operations
 *
 * Functions for checking permissions and listing accessible resources.
 * These are called by middleware and services for authorization.
 *
 * All permission check functions now support optional ABAC context.
 */

import { getFgaClient } from '../client.js';
import type { FgaCheckRequest, FgaCheckResponse, FgaResourceType, ABACContext } from '../types.js';

// =============================================================================
// Permission Checks
// =============================================================================

/**
 * Checks if a user has a specific permission on a resource.
 *
 * @example
 * ```typescript
 * const allowed = await checkPermission({
 *   userId: '123',
 *   relation: 'can_view',
 *   resourceType: 'project',
 *   resourceId: 'demo',
 * });
 * ```
 */
export async function checkPermission(request: FgaCheckRequest): Promise<FgaCheckResponse> {
  const client = getFgaClient();
  return client.check(request);
}

/**
 * Checks if a user can view a resource.
 *
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param resourceId - Resource ID
 * @param context - Optional ABAC context for conditional checks
 */
export async function canView(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
  context?: ABACContext,
): Promise<boolean> {
  const result = await checkPermission({
    userId,
    relation: 'can_view',
    resourceType,
    resourceId,
    context,
  });
  return result.allowed;
}

/**
 * Checks if a user can edit a resource.
 *
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param resourceId - Resource ID
 * @param context - Optional ABAC context for conditional checks
 */
export async function canEdit(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
  context?: ABACContext,
): Promise<boolean> {
  const result = await checkPermission({
    userId,
    relation: 'can_edit',
    resourceType,
    resourceId,
    context,
  });
  return result.allowed;
}

/**
 * Checks if a user can delete a resource.
 *
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param resourceId - Resource ID
 * @param context - Optional ABAC context for conditional checks
 */
export async function canDelete(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
  context?: ABACContext,
): Promise<boolean> {
  const result = await checkPermission({
    userId,
    relation: 'can_delete',
    resourceType,
    resourceId,
    context,
  });
  return result.allowed;
}

/**
 * Checks if a user can manage a resource.
 *
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param resourceId - Resource ID
 * @param context - Optional ABAC context for conditional checks
 */
export async function canManage(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
  context?: ABACContext,
): Promise<boolean> {
  const result = await checkPermission({
    userId,
    relation: 'can_manage',
    resourceType,
    resourceId,
    context,
  });
  return result.allowed;
}

/**
 * Checks if a user can execute a query.
 *
 * @param userId - User ID
 * @param queryId - Query ID
 * @param context - Optional ABAC context (e.g., for business hours check)
 */
export async function canExecuteQuery(
  userId: string,
  queryId: string,
  context?: ABACContext,
): Promise<boolean> {
  const result = await checkPermission({
    userId,
    relation: 'can_execute',
    resourceType: 'query',
    resourceId: queryId,
    context,
  });
  return result.allowed;
}

/**
 * Batch check multiple permissions.
 */
export async function batchCheckPermissions(
  requests: FgaCheckRequest[],
): Promise<Array<{ request: FgaCheckRequest; allowed: boolean }>> {
  const client = getFgaClient();
  return client.batchCheck(requests);
}

// =============================================================================
// List Operations
// =============================================================================

/**
 * Lists all resources of a type that a user can access with a specific relation.
 *
 * @example
 * ```typescript
 * const projects = await listAccessibleResources('123', 'viewer', 'project');
 * // → ['demo', 'test'] (resource IDs)
 * ```
 */
export async function listAccessibleResources(
  userId: string,
  relation: string,
  resourceType: FgaResourceType,
): Promise<string[]> {
  const client = getFgaClient();
  const objects = await client.listObjects({
    userId,
    relation,
    resourceType,
  });

  // Extract IDs from 'type:id' format
  return objects.map((obj) => {
    const parts = obj.split(':');
    return parts.slice(1).join(':');
  });
}

/**
 * Lists all projects a user can view.
 */
export async function listViewableProjects(userId: string): Promise<string[]> {
  return listAccessibleResources(userId, 'can_view', 'project');
}

/**
 * Lists all projects a user can edit.
 */
export async function listEditableProjects(userId: string): Promise<string[]> {
  return listAccessibleResources(userId, 'can_edit', 'project');
}

/**
 * Lists all teams a user is a member of.
 */
export async function listUserTeams(userId: string): Promise<string[]> {
  return listAccessibleResources(userId, 'member', 'team');
}

/**
 * Lists all tenants a user belongs to.
 */
export async function listUserTenants(userId: string): Promise<string[]> {
  return listAccessibleResources(userId, 'member', 'tenant');
}

// =============================================================================
// User Lookups
// =============================================================================

/**
 * Lists all users that have a specific relation on a resource.
 *
 * @example
 * ```typescript
 * const viewers = await listUsersWithAccess('project', 'demo', 'viewer');
 * // → ['123', '456'] (user IDs)
 * ```
 */
export async function listUsersWithAccess(
  resourceType: FgaResourceType,
  resourceId: string,
  relation: string,
): Promise<string[]> {
  const client = getFgaClient();
  const users = await client.listUsers({
    resourceType,
    resourceId,
    relation,
  });

  // Extract user IDs from 'user:id' format
  return users.map((u) => {
    const parts = u.split(':');
    return parts.slice(1).join(':');
  });
}

/**
 * Lists all viewers of a project.
 */
export async function listProjectViewers(projectId: string): Promise<string[]> {
  return listUsersWithAccess('project', projectId, 'viewer');
}

/**
 * Lists all editors of a project.
 */
export async function listProjectEditors(projectId: string): Promise<string[]> {
  return listUsersWithAccess('project', projectId, 'editor');
}

/**
 * Lists all admins of a project.
 */
export async function listProjectAdmins(projectId: string): Promise<string[]> {
  return listUsersWithAccess('project', projectId, 'admin');
}

/**
 * Lists all members of a team.
 */
export async function listTeamMembers(teamId: string): Promise<string[]> {
  return listUsersWithAccess('team', teamId, 'member');
}

// =============================================================================
// Access Summary
// =============================================================================

/**
 * Gets a summary of a user's access to a resource.
 */
export async function getAccessSummary(
  userId: string,
  resourceType: FgaResourceType,
  resourceId: string,
): Promise<{
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
}> {
  const results = await batchCheckPermissions([
    { userId, relation: 'can_view', resourceType, resourceId },
    { userId, relation: 'can_edit', resourceType, resourceId },
    { userId, relation: 'can_delete', resourceType, resourceId },
    { userId, relation: 'can_manage', resourceType, resourceId },
  ]);

  return {
    canView: results[0]?.allowed ?? false,
    canEdit: results[1]?.allowed ?? false,
    canDelete: results[2]?.allowed ?? false,
    canManage: results[3]?.allowed ?? false,
  };
}
