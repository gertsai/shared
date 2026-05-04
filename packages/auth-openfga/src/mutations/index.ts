/**
 * OpenFGA Mutation Operations
 *
 * Functions for writing/deleting relationship tuples.
 * These are called by event handlers when IAM events occur.
 */

import { getFgaClient } from '../client.js';
import type {
  FgaTupleKey,
  FgaResourceType,
  MembershipEventPayload,
  RoleAssignmentPayload,
} from '../types.js';
import {
  userString,
  objectString,
  teamMemberString,
  roleAssigneeString,
  FGA_RELATIONS,
} from '../constants.js';

// =============================================================================
// Low-Level Mutations
// =============================================================================

/**
 * Writes relationship tuples to OpenFGA.
 */
export async function writeTuples(tuples: FgaTupleKey[]): Promise<void> {
  const client = getFgaClient();
  await client.writeTuples(tuples);
}

/**
 * Deletes relationship tuples from OpenFGA.
 */
export async function deleteTuples(tuples: FgaTupleKey[]): Promise<void> {
  const client = getFgaClient();
  await client.deleteTuples(tuples);
}

/**
 * Writes and deletes tuples in a single transaction.
 */
export async function writeTransaction(options: {
  writes?: FgaTupleKey[];
  deletes?: FgaTupleKey[];
}): Promise<void> {
  const client = getFgaClient();
  await client.write(options);
}

// =============================================================================
// User Mutations
// =============================================================================

/**
 * Creates tuples for a new user (adds to tenant).
 */
export async function onUserCreated(userId: string, tenantId: string): Promise<void> {
  await writeTuples([
    {
      user: userString(userId),
      relation: FGA_RELATIONS.MEMBER,
      object: objectString('tenant', tenantId),
    },
  ]);
}

/**
 * Deletes all tuples for a user.
 * Note: This is a cleanup operation. In practice, you may want to
 * query existing tuples and delete them specifically.
 */
export async function onUserDeleted(userId: string, tenantId: string): Promise<void> {
  // Delete tenant membership
  await deleteTuples([
    {
      user: userString(userId),
      relation: FGA_RELATIONS.MEMBER,
      object: objectString('tenant', tenantId),
    },
  ]);
}

// =============================================================================
// Membership Mutations
// =============================================================================

/**
 * Handles iam.membership.added event.
 * Grants user access to a resource with specified relation.
 */
export async function onMembershipAdded(payload: MembershipEventPayload): Promise<void> {
  await writeTuples([
    {
      user: userString(payload.userId),
      relation: payload.relation,
      object: objectString(payload.resourceType, payload.resourceId),
    },
  ]);
}

/**
 * Handles iam.membership.removed event.
 * Revokes user access from a resource.
 */
export async function onMembershipRemoved(payload: MembershipEventPayload): Promise<void> {
  await deleteTuples([
    {
      user: userString(payload.userId),
      relation: payload.relation,
      object: objectString(payload.resourceType, payload.resourceId),
    },
  ]);
}

// =============================================================================
// Role Mutations
// =============================================================================

/**
 * Handles iam.role.assigned event.
 * Assigns a role to a user.
 */
export async function onRoleAssigned(payload: RoleAssignmentPayload): Promise<void> {
  await writeTuples([
    {
      user: userString(payload.userId),
      relation: FGA_RELATIONS.ASSIGNEE,
      object: objectString('role', payload.roleId),
    },
  ]);
}

/**
 * Handles iam.role.unassigned event.
 * Removes a role from a user.
 */
export async function onRoleUnassigned(payload: RoleAssignmentPayload): Promise<void> {
  await deleteTuples([
    {
      user: userString(payload.userId),
      relation: FGA_RELATIONS.ASSIGNEE,
      object: objectString('role', payload.roleId),
    },
  ]);
}

// =============================================================================
// Team Mutations
// =============================================================================

/**
 * Adds a user to a team with specified role.
 */
export async function onTeamMemberAdded(
  userId: string,
  teamId: string,
  role: 'member' | 'lead' | 'admin' = 'member',
): Promise<void> {
  await writeTuples([
    {
      user: userString(userId),
      relation: role,
      object: objectString('team', teamId),
    },
  ]);
}

/**
 * Removes a user from a team.
 */
export async function onTeamMemberRemoved(
  userId: string,
  teamId: string,
  role: 'member' | 'lead' | 'admin' = 'member',
): Promise<void> {
  await deleteTuples([
    {
      user: userString(userId),
      relation: role,
      object: objectString('team', teamId),
    },
  ]);
}

/**
 * Sets team hierarchy (parent team).
 */
export async function setTeamParent(childTeamId: string, parentTeamId: string): Promise<void> {
  await writeTuples([
    {
      user: objectString('team', parentTeamId),
      relation: FGA_RELATIONS.PARENT,
      object: objectString('team', childTeamId),
    },
  ]);
}

// =============================================================================
// Project Mutations
// =============================================================================

/**
 * Grants team access to a project.
 */
export async function grantTeamProjectAccess(
  teamId: string,
  projectId: string,
  relation: 'viewer' | 'editor' | 'admin' = 'viewer',
): Promise<void> {
  await writeTuples([
    {
      user: teamMemberString(teamId),
      relation,
      object: objectString('project', projectId),
    },
  ]);
}

/**
 * Grants role-based access to a project.
 */
export async function grantRoleProjectAccess(
  roleId: string,
  projectId: string,
  relation: 'viewer' | 'editor' | 'admin' = 'viewer',
): Promise<void> {
  await writeTuples([
    {
      user: roleAssigneeString(roleId),
      relation,
      object: objectString('project', projectId),
    },
  ]);
}

/**
 * Sets project tenant.
 */
export async function setProjectTenant(projectId: string, tenantId: string): Promise<void> {
  await writeTuples([
    {
      user: objectString('tenant', tenantId),
      relation: FGA_RELATIONS.TENANT,
      object: objectString('project', projectId),
    },
  ]);
}

// =============================================================================
// API Key Mutations
// =============================================================================

/**
 * Sets API key owner and tenant.
 */
export async function onApiKeyCreated(
  apiKeyId: string,
  ownerId: string,
  tenantId: string,
): Promise<void> {
  await writeTuples([
    {
      user: userString(ownerId),
      relation: FGA_RELATIONS.OWNER,
      object: objectString('api_key', apiKeyId),
    },
    {
      user: objectString('tenant', tenantId),
      relation: FGA_RELATIONS.TENANT,
      object: objectString('api_key', apiKeyId),
    },
  ]);
}

/**
 * Removes API key tuples.
 */
export async function onApiKeyDeleted(
  apiKeyId: string,
  ownerId: string,
  tenantId: string,
): Promise<void> {
  await deleteTuples([
    {
      user: userString(ownerId),
      relation: FGA_RELATIONS.OWNER,
      object: objectString('api_key', apiKeyId),
    },
    {
      user: objectString('tenant', tenantId),
      relation: FGA_RELATIONS.TENANT,
      object: objectString('api_key', apiKeyId),
    },
  ]);
}

// =============================================================================
// Bulk Operations (B3.2)
// =============================================================================

/**
 * Maximum tuples per batch (OpenFGA limit).
 */
const MAX_TUPLES_PER_BATCH = 100;

/**
 * Options for bulk operations.
 */
export interface BulkOperationOptions {
  /** Process batches in parallel (default: false for safety) */
  parallel?: boolean;
  /** Callback for progress tracking */
  onProgress?: (processed: number, total: number) => void;
  /** Continue on error (default: false) */
  continueOnError?: boolean;
}

/**
 * Result of a bulk operation.
 */
export interface BulkOperationResult {
  /** Total tuples processed */
  processed: number;
  /** Failed tuple indices */
  failed: number[];
  /** Errors encountered */
  errors: Array<{ index: number; error: string }>;
}

/**
 * Grants access to multiple users for a single resource.
 *
 * @example
 * ```typescript
 * // Grant view access to 100 users
 * await bulkGrantAccess(
 *   ['user1', 'user2', ...],
 *   'viewer',
 *   'project',
 *   'demo',
 * );
 * ```
 */
export async function bulkGrantAccess(
  userIds: string[],
  relation: string,
  resourceType: FgaResourceType,
  resourceId: string,
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const tuples: FgaTupleKey[] = userIds.map((userId) => ({
    user: userString(userId),
    relation,
    object: objectString(resourceType, resourceId),
  }));

  return bulkWriteTuples(tuples, options);
}

/**
 * Revokes access from multiple users for a single resource.
 *
 * @example
 * ```typescript
 * // Revoke view access from 100 users
 * await bulkRevokeAccess(
 *   ['user1', 'user2', ...],
 *   'viewer',
 *   'project',
 *   'demo',
 * );
 * ```
 */
export async function bulkRevokeAccess(
  userIds: string[],
  relation: string,
  resourceType: FgaResourceType,
  resourceId: string,
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const tuples: FgaTupleKey[] = userIds.map((userId) => ({
    user: userString(userId),
    relation,
    object: objectString(resourceType, resourceId),
  }));

  return bulkDeleteTuples(tuples, options);
}

/**
 * Grants same user access to multiple resources.
 *
 * @example
 * ```typescript
 * // Grant user access to all projects
 * await bulkGrantToResources(
 *   'user1',
 *   'viewer',
 *   'project',
 *   ['proj1', 'proj2', 'proj3'],
 * );
 * ```
 */
export async function bulkGrantToResources(
  userId: string,
  relation: string,
  resourceType: FgaResourceType,
  resourceIds: string[],
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const tuples: FgaTupleKey[] = resourceIds.map((resourceId) => ({
    user: userString(userId),
    relation,
    object: objectString(resourceType, resourceId),
  }));

  return bulkWriteTuples(tuples, options);
}

/**
 * Revokes user access from multiple resources.
 */
export async function bulkRevokeFromResources(
  userId: string,
  relation: string,
  resourceType: FgaResourceType,
  resourceIds: string[],
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const tuples: FgaTupleKey[] = resourceIds.map((resourceId) => ({
    user: userString(userId),
    relation,
    object: objectString(resourceType, resourceId),
  }));

  return bulkDeleteTuples(tuples, options);
}

/**
 * Writes tuples in batches.
 */
export async function bulkWriteTuples(
  tuples: FgaTupleKey[],
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const client = getFgaClient();
  const result: BulkOperationResult = {
    processed: 0,
    failed: [],
    errors: [],
  };

  // Split into batches
  const batches: FgaTupleKey[][] = [];
  for (let i = 0; i < tuples.length; i += MAX_TUPLES_PER_BATCH) {
    batches.push(tuples.slice(i, i + MAX_TUPLES_PER_BATCH));
  }

  // Process batches
  const processBatch = async (batch: FgaTupleKey[], batchIndex: number): Promise<void> => {
    try {
      await client.writeTuples(batch);
      result.processed += batch.length;
    } catch (error) {
      // Mark all tuples in batch as failed
      const startIndex = batchIndex * MAX_TUPLES_PER_BATCH;
      for (let i = 0; i < batch.length; i++) {
        result.failed.push(startIndex + i);
      }
      result.errors.push({
        index: startIndex,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!options?.continueOnError) {
        throw error;
      }
    }

    options?.onProgress?.(result.processed, tuples.length);
  };

  if (options?.parallel) {
    await Promise.all(batches.map((batch, i) => processBatch(batch, i)));
  } else {
    for (let i = 0; i < batches.length; i++) {
      await processBatch(batches[i], i);
    }
  }

  return result;
}

/**
 * Deletes tuples in batches.
 */
export async function bulkDeleteTuples(
  tuples: FgaTupleKey[],
  options?: BulkOperationOptions,
): Promise<BulkOperationResult> {
  const client = getFgaClient();
  const result: BulkOperationResult = {
    processed: 0,
    failed: [],
    errors: [],
  };

  // Split into batches
  const batches: FgaTupleKey[][] = [];
  for (let i = 0; i < tuples.length; i += MAX_TUPLES_PER_BATCH) {
    batches.push(tuples.slice(i, i + MAX_TUPLES_PER_BATCH));
  }

  // Process batches
  const processBatch = async (batch: FgaTupleKey[], batchIndex: number): Promise<void> => {
    try {
      await client.deleteTuples(batch);
      result.processed += batch.length;
    } catch (error) {
      // Ignore "tuple not found" errors for idempotent deletes
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        // Consider successful - tuple already deleted
        result.processed += batch.length;
        return;
      }

      // Mark all tuples in batch as failed
      const startIndex = batchIndex * MAX_TUPLES_PER_BATCH;
      for (let i = 0; i < batch.length; i++) {
        result.failed.push(startIndex + i);
      }
      result.errors.push({
        index: startIndex,
        error: errorMessage,
      });

      if (!options?.continueOnError) {
        throw error;
      }
    }

    options?.onProgress?.(result.processed, tuples.length);
  };

  if (options?.parallel) {
    await Promise.all(batches.map((batch, i) => processBatch(batch, i)));
  } else {
    for (let i = 0; i < batches.length; i++) {
      await processBatch(batches[i], i);
    }
  }

  return result;
}
