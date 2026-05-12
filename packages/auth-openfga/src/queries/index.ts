/**
 * OpenFGA Query Operations
 *
 * Functions for checking permissions and listing accessible resources.
 * These are called by middleware and services for authorization.
 *
 * All permission check functions now support optional ABAC context.
 */

import { getFgaClient, type GertsFgaClient } from '../client.js';
import { isDenied } from '../deny/index.js';
import { getPermissionCache } from '../cache/index.js';
import type {
  FgaCheckRequest,
  FgaCheckResponse,
  FgaResourceType,
  ABACContext,
  FgaExpandRequest,
  FgaExpandNode,
} from '../types.js';

// =============================================================================
// Permission Checks
// =============================================================================

/**
 * Checks if a user has a specific permission on a resource.
 *
 * Flow:
 * 1. Check deny ledger first (instant revoke)
 * 2. If denied, return false immediately
 * 3. Check cache for existing result
 * 4. If not cached, check OpenFGA and cache result
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
/**
 * Wave 6.3 (ADR-012 + RFC-004 Edge 1.4) — opts for cross-tenant
 * isolation.
 *
 * When `client` is supplied, `checkPermission` uses that instance
 * directly — bypassing the default `getFgaClient()` lookup. This is
 * the key escape hatch for multi-tenant SaaS: callers (typically the
 * `OpenFgaPermissionGate` in m9s-example) resolve their per-tenant
 * client via `getFgaClient(gateConfig)` and forward it here so the
 * SDK call uses the right credentials + storeId.
 *
 * When `cacheScope` is supplied, the per-tenant `PermissionCache` is
 * consulted instead of the default. Typically the gate passes
 * `fingerprint(gateConfig)` for symmetry with the client cache.
 *
 * When neither is supplied, behaviour is identical to the
 * pre-Wave-6.3 single-config path (back-compat).
 *
 * Wave 6.3 Pre-Build ARCH-P1-2 — `clientScope` removed: was
 * documented "reserved for future" and never implemented; reserved
 * surface in published packages locks semantics future maintainers
 * must preserve. Re-add when a real follow-up needs string-scope
 * lookup. Adding optional fields is non-breaking, removing them is —
 * so erring on the side of NOT shipping unused surface.
 */
export interface CheckPermissionOptions {
  /**
   * Explicit client instance — when present, used directly instead of
   * the default singleton. Pair with the matching `cacheScope` for
   * full isolation.
   */
  readonly client?: GertsFgaClient;
  /** Cache partition key — typically `fingerprint(config)` for symmetry. */
  readonly cacheScope?: string;
}

export async function checkPermission(
  request: FgaCheckRequest,
  opts?: CheckPermissionOptions,
): Promise<FgaCheckResponse> {
  // 1. Check deny ledger first (instant revoke)
  const denyResult = await isDenied({
    userId: request.userId,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    relation: request.relation,
  });

  if (denyResult.denied) {
    return {
      allowed: false,
      resolution: `Denied: ${denyResult.reason ?? 'Access revoked'}`,
    };
  }

  // 2. Check cache (skip for requests with ABAC context as they're dynamic)
  const cache = getPermissionCache(undefined, opts?.cacheScope);
  const cacheKey = {
    userId: request.userId,
    relation: request.relation,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
  };

  if (!request.context) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // 3. Proceed to OpenFGA check.
  //    Wave 6.3: if caller supplied an explicit client, use it (per-tenant
  //    isolation). Else fall through to the default singleton — preserves
  //    current behaviour for single-config workloads.
  const client = opts?.client ?? getFgaClient();
  const result = await client.check(request);

  // 4. Cache result (only for non-ABAC requests)
  if (!request.context) {
    cache.set(cacheKey, result);
  }

  return result;
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
    ...(context !== undefined && { context }),
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
    ...(context !== undefined && { context }),
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
    ...(context !== undefined && { context }),
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
    ...(context !== undefined && { context }),
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
    ...(context !== undefined && { context }),
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

// =============================================================================
// Explain Operations
// =============================================================================

/**
 * Expands a relation to explain authorization paths.
 *
 * @example
 * ```typescript
 * const tree = await expandPermission({
 *   relation: 'can_view',
 *   resourceType: 'project',
 *   resourceId: 'demo',
 * });
 * ```
 */
export async function expandPermission(request: FgaExpandRequest): Promise<FgaExpandNode> {
  const client = getFgaClient();
  return client.expand(request);
}

/**
 * Explains why a user has (or doesn't have) access to a resource.
 * Combines check + expand for a complete picture.
 *
 * @example
 * ```typescript
 * const explanation = await explainAccess({
 *   userId: 'alice',
 *   relation: 'can_view',
 *   resourceType: 'project',
 *   resourceId: 'demo',
 * });
 * // → { allowed: true, reason: 'direct', paths: [...] }
 * ```
 */
export async function explainAccess(request: FgaCheckRequest): Promise<{
  allowed: boolean;
  reason: 'direct' | 'inherited' | 'role' | 'team' | 'denied' | 'no_relation';
  paths: string[][];
  expandTree?: FgaExpandNode;
}> {
  const client = getFgaClient();

  // First check if allowed
  const checkResult = await client.check(request);

  // Then expand to find paths
  let expandTree: FgaExpandNode | undefined;
  const paths: string[][] = [];

  try {
    expandTree = await client.expand({
      relation: request.relation,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
    });

    // Extract paths from tree
    extractPaths(expandTree, [], paths, request.userId);
  } catch {
    // Expand might fail if no tuples exist
  }

  // Determine reason
  let reason: 'direct' | 'inherited' | 'role' | 'team' | 'denied' | 'no_relation' = 'no_relation';

  if (checkResult.allowed) {
    // Analyze paths to determine reason
    const userKey = `user:${request.userId}`;
    const hasDirect = paths.some((p) => p.length === 1 && p[0] === userKey);
    const hasTeamPath = paths.some((p) => p.some((node) => node.startsWith('team:')));
    const hasRolePath = paths.some((p) => p.some((node) => node.startsWith('role:')));

    if (hasDirect) {
      reason = 'direct';
    } else if (hasRolePath) {
      reason = 'role';
    } else if (hasTeamPath) {
      reason = 'team';
    } else if (paths.length > 0) {
      reason = 'inherited';
    }
  } else {
    reason = 'denied';
  }

  return {
    allowed: checkResult.allowed,
    reason,
    paths,
    ...(expandTree !== undefined && { expandTree }),
  };
}

/**
 * Extracts user paths from expand tree.
 */
function extractPaths(
  node: FgaExpandNode,
  currentPath: string[],
  allPaths: string[][],
  targetUser: string,
): void {
  if (node.type === 'leaf') {
    if (node.users) {
      for (const user of node.users) {
        const newPath = [...currentPath, user];
        // Only add paths that lead to target user
        if (user === `user:${targetUser}` || user.includes('#')) {
          allPaths.push(newPath);
        }
      }
    }
    if (node.computed) {
      allPaths.push([...currentPath, `computed:${node.computed}`]);
    }
  } else if (node.children) {
    for (const child of node.children) {
      extractPaths(child, currentPath, allPaths, targetUser);
    }
  }
}
