/**
 * Connector-related enums for the Data Connectors system (RFC-042)
 * Ported from: sources/onyx/backend/onyx/db/enums.py
 */

/**
 * Status of an indexing operation
 */
export const IndexingStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  CANCELED: 'canceled',
  FAILED: 'failed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
} as const;

export type IndexingStatus = (typeof IndexingStatus)[keyof typeof IndexingStatus];

/** Terminal indexing states */
const TERMINAL_INDEXING_STATES = new Set<IndexingStatus>([
  IndexingStatus.SUCCESS,
  IndexingStatus.COMPLETED_WITH_ERRORS,
  IndexingStatus.CANCELED,
  IndexingStatus.FAILED,
]);

/** Successful indexing states */
const SUCCESSFUL_INDEXING_STATES = new Set<IndexingStatus>([
  IndexingStatus.SUCCESS,
  IndexingStatus.COMPLETED_WITH_ERRORS,
]);

export const IndexingStatusUtils = {
  isTerminal: (status: IndexingStatus): boolean => TERMINAL_INDEXING_STATES.has(status),
  isSuccessful: (status: IndexingStatus): boolean => SUCCESSFUL_INDEXING_STATES.has(status),
} as const;

/**
 * Status of a permission sync attempt
 */
export const PermissionSyncStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  CANCELED: 'canceled',
  FAILED: 'failed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
} as const;

export type PermissionSyncStatus = (typeof PermissionSyncStatus)[keyof typeof PermissionSyncStatus];

const TERMINAL_PERMISSION_SYNC_STATES = new Set<PermissionSyncStatus>([
  PermissionSyncStatus.SUCCESS,
  PermissionSyncStatus.COMPLETED_WITH_ERRORS,
  PermissionSyncStatus.CANCELED,
  PermissionSyncStatus.FAILED,
]);

const SUCCESSFUL_PERMISSION_SYNC_STATES = new Set<PermissionSyncStatus>([
  PermissionSyncStatus.SUCCESS,
  PermissionSyncStatus.COMPLETED_WITH_ERRORS,
]);

export const PermissionSyncStatusUtils = {
  isTerminal: (status: PermissionSyncStatus): boolean =>
    TERMINAL_PERMISSION_SYNC_STATES.has(status),
  isSuccessful: (status: PermissionSyncStatus): boolean =>
    SUCCESSFUL_PERMISSION_SYNC_STATES.has(status),
} as const;

/**
 * Indexing mode for document sync
 */
export const IndexingMode = {
  /** Incremental update of changed documents */
  UPDATE: 'update',
  /** Full reindex of all documents */
  REINDEX: 'reindex',
} as const;

export type IndexingMode = (typeof IndexingMode)[keyof typeof IndexingMode];

/**
 * How documents are processed after fetching
 */
export const ProcessingMode = {
  /** Full pipeline: chunk → embed → vector DB */
  REGULAR: 'REGULAR',
  /** Write to file system only (for debugging) */
  FILE_SYSTEM: 'FILE_SYSTEM',
} as const;

export type ProcessingMode = (typeof ProcessingMode)[keyof typeof ProcessingMode];

/**
 * Type of sync operation
 */
export const SyncType = {
  DOCUMENT_SET: 'document_set',
  USER_GROUP: 'user_group',
  CONNECTOR_DELETION: 'connector_deletion',
  PRUNING: 'pruning',
  EXTERNAL_PERMISSIONS: 'external_permissions',
  EXTERNAL_GROUP: 'external_group',
} as const;

export type SyncType = (typeof SyncType)[keyof typeof SyncType];

/**
 * Status of a sync operation
 */
export const SyncStatus = {
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

const TERMINAL_SYNC_STATES = new Set<SyncStatus>([SyncStatus.SUCCESS, SyncStatus.FAILED]);

export const SyncStatusUtils = {
  isTerminal: (status: SyncStatus): boolean => TERMINAL_SYNC_STATES.has(status),
} as const;

/**
 * Status of a connector-credential pair
 */
export const ConnectorCredentialPairStatus = {
  /** Waiting for first indexing run */
  SCHEDULED: 'SCHEDULED',
  /** Currently performing initial indexing */
  INITIAL_INDEXING: 'INITIAL_INDEXING',
  /** Active and syncing on schedule */
  ACTIVE: 'ACTIVE',
  /** Temporarily paused by user */
  PAUSED: 'PAUSED',
  /** Being deleted */
  DELETING: 'DELETING',
  /** Invalid credentials or configuration */
  INVALID: 'INVALID',
} as const;

export type ConnectorCredentialPairStatus =
  (typeof ConnectorCredentialPairStatus)[keyof typeof ConnectorCredentialPairStatus];

const ACTIVE_CC_PAIR_STATUSES = new Set<ConnectorCredentialPairStatus>([
  ConnectorCredentialPairStatus.ACTIVE,
  ConnectorCredentialPairStatus.SCHEDULED,
  ConnectorCredentialPairStatus.INITIAL_INDEXING,
]);

const INDEXABLE_CC_PAIR_STATUSES = new Set<ConnectorCredentialPairStatus>([
  ...ACTIVE_CC_PAIR_STATUSES,
  ConnectorCredentialPairStatus.PAUSED,
]);

export const ConnectorCredentialPairStatusUtils = {
  activeStatuses: (): ConnectorCredentialPairStatus[] => [...ACTIVE_CC_PAIR_STATUSES],
  indexableStatuses: (): ConnectorCredentialPairStatus[] => [...INDEXABLE_CC_PAIR_STATUSES],
  isActive: (status: ConnectorCredentialPairStatus): boolean => ACTIVE_CC_PAIR_STATUSES.has(status),
  isIndexable: (status: ConnectorCredentialPairStatus): boolean =>
    INDEXABLE_CC_PAIR_STATUSES.has(status),
} as const;

/**
 * Document access type for permission filtering
 */
export const AccessType = {
  /** Accessible to all users */
  PUBLIC: 'public',
  /** Private to specific users/groups */
  PRIVATE: 'private',
  /** Synced from external system ACL */
  SYNC: 'sync',
} as const;

export type AccessType = (typeof AccessType)[keyof typeof AccessType];

/**
 * Types of hierarchy nodes across different connector sources
 */
export const HierarchyNodeType = {
  // Generic
  FOLDER: 'folder',

  // Root-level type
  SOURCE: 'source',

  // Google Drive
  SHARED_DRIVE: 'shared_drive',
  MY_DRIVE: 'my_drive',

  // Confluence
  SPACE: 'space',
  PAGE: 'page',

  // Jira
  PROJECT: 'project',

  // Notion
  DATABASE: 'database',
  WORKSPACE: 'workspace',

  // SharePoint
  SITE: 'site',
  DRIVE: 'drive',

  // Slack
  CHANNEL: 'channel',
} as const;

export type HierarchyNodeType = (typeof HierarchyNodeType)[keyof typeof HierarchyNodeType];
