/**
 * OpenFGA Mutation Operations
 *
 * Functions for writing/deleting relationship tuples.
 * These are called by event handlers when IAM events occur.
 */

import { getFgaClient } from '../client.js';
import type { FgaTupleKey, FgaResourceType, MembershipEventPayload, RoleAssignmentPayload } from '../types.js';
import { userString, objectString, teamMemberString, roleAssigneeString, FGA_RELATIONS } from '../constants.js';

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
