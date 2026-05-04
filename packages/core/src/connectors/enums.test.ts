import { describe, it, expect } from 'vitest';

import {
  IndexingStatus,
  IndexingStatusUtils,
  PermissionSyncStatus,
  PermissionSyncStatusUtils,
  SyncStatus,
  SyncStatusUtils,
  ConnectorCredentialPairStatus,
  ConnectorCredentialPairStatusUtils,
  IndexingMode,
  ProcessingMode,
  SyncType,
  AccessType,
  HierarchyNodeType,
} from './enums';

describe('IndexingStatus', () => {
  describe('IndexingStatusUtils.isTerminal', () => {
    it('returns true for terminal states', () => {
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.SUCCESS)).toBe(true);
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.COMPLETED_WITH_ERRORS)).toBe(true);
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.CANCELED)).toBe(true);
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.FAILED)).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.NOT_STARTED)).toBe(false);
      expect(IndexingStatusUtils.isTerminal(IndexingStatus.IN_PROGRESS)).toBe(false);
    });
  });

  describe('IndexingStatusUtils.isSuccessful', () => {
    it('returns true for successful states', () => {
      expect(IndexingStatusUtils.isSuccessful(IndexingStatus.SUCCESS)).toBe(true);
      expect(IndexingStatusUtils.isSuccessful(IndexingStatus.COMPLETED_WITH_ERRORS)).toBe(true);
    });

    it('returns false for unsuccessful states', () => {
      expect(IndexingStatusUtils.isSuccessful(IndexingStatus.FAILED)).toBe(false);
      expect(IndexingStatusUtils.isSuccessful(IndexingStatus.CANCELED)).toBe(false);
      expect(IndexingStatusUtils.isSuccessful(IndexingStatus.NOT_STARTED)).toBe(false);
    });
  });
});

describe('PermissionSyncStatus', () => {
  describe('PermissionSyncStatusUtils.isTerminal', () => {
    it('returns true for terminal states', () => {
      expect(PermissionSyncStatusUtils.isTerminal(PermissionSyncStatus.SUCCESS)).toBe(true);
      expect(PermissionSyncStatusUtils.isTerminal(PermissionSyncStatus.FAILED)).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(PermissionSyncStatusUtils.isTerminal(PermissionSyncStatus.IN_PROGRESS)).toBe(false);
    });
  });

  describe('PermissionSyncStatusUtils.isSuccessful', () => {
    it('returns true for successful states', () => {
      expect(PermissionSyncStatusUtils.isSuccessful(PermissionSyncStatus.SUCCESS)).toBe(true);
      expect(
        PermissionSyncStatusUtils.isSuccessful(PermissionSyncStatus.COMPLETED_WITH_ERRORS),
      ).toBe(true);
    });
  });
});

describe('SyncStatus', () => {
  describe('SyncStatusUtils.isTerminal', () => {
    it('returns true for terminal states', () => {
      expect(SyncStatusUtils.isTerminal(SyncStatus.SUCCESS)).toBe(true);
      expect(SyncStatusUtils.isTerminal(SyncStatus.FAILED)).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(SyncStatusUtils.isTerminal(SyncStatus.IN_PROGRESS)).toBe(false);
      expect(SyncStatusUtils.isTerminal(SyncStatus.CANCELED)).toBe(false);
    });
  });
});

describe('ConnectorCredentialPairStatus', () => {
  describe('ConnectorCredentialPairStatusUtils.activeStatuses', () => {
    it('returns active statuses', () => {
      const active = ConnectorCredentialPairStatusUtils.activeStatuses();
      expect(active).toContain(ConnectorCredentialPairStatus.ACTIVE);
      expect(active).toContain(ConnectorCredentialPairStatus.SCHEDULED);
      expect(active).toContain(ConnectorCredentialPairStatus.INITIAL_INDEXING);
      expect(active).not.toContain(ConnectorCredentialPairStatus.PAUSED);
    });
  });

  describe('ConnectorCredentialPairStatusUtils.indexableStatuses', () => {
    it('returns indexable statuses (superset of active)', () => {
      const indexable = ConnectorCredentialPairStatusUtils.indexableStatuses();
      expect(indexable).toContain(ConnectorCredentialPairStatus.ACTIVE);
      expect(indexable).toContain(ConnectorCredentialPairStatus.PAUSED);
      expect(indexable).not.toContain(ConnectorCredentialPairStatus.DELETING);
    });
  });

  describe('ConnectorCredentialPairStatusUtils.isActive', () => {
    it('returns true for active statuses', () => {
      expect(
        ConnectorCredentialPairStatusUtils.isActive(ConnectorCredentialPairStatus.ACTIVE),
      ).toBe(true);
    });

    it('returns false for inactive statuses', () => {
      expect(
        ConnectorCredentialPairStatusUtils.isActive(ConnectorCredentialPairStatus.PAUSED),
      ).toBe(false);
    });
  });

  describe('ConnectorCredentialPairStatusUtils.isIndexable', () => {
    it('returns true for indexable statuses', () => {
      expect(
        ConnectorCredentialPairStatusUtils.isIndexable(ConnectorCredentialPairStatus.ACTIVE),
      ).toBe(true);
      expect(
        ConnectorCredentialPairStatusUtils.isIndexable(ConnectorCredentialPairStatus.PAUSED),
      ).toBe(true);
    });

    it('returns false for non-indexable statuses', () => {
      expect(
        ConnectorCredentialPairStatusUtils.isIndexable(ConnectorCredentialPairStatus.DELETING),
      ).toBe(false);
    });
  });
});

describe('Other Enums', () => {
  it('IndexingMode has expected values', () => {
    expect(IndexingMode.UPDATE).toBe('update');
    expect(IndexingMode.REINDEX).toBe('reindex');
  });

  it('ProcessingMode has expected values', () => {
    expect(ProcessingMode.REGULAR).toBe('REGULAR');
    expect(ProcessingMode.FILE_SYSTEM).toBe('FILE_SYSTEM');
  });

  it('SyncType has expected values', () => {
    expect(SyncType.DOCUMENT_SET).toBe('document_set');
    expect(SyncType.EXTERNAL_PERMISSIONS).toBe('external_permissions');
    expect(SyncType.EXTERNAL_GROUP).toBe('external_group');
  });

  it('AccessType has expected values', () => {
    expect(AccessType.PUBLIC).toBe('public');
    expect(AccessType.PRIVATE).toBe('private');
    expect(AccessType.SYNC).toBe('sync');
  });

  it('HierarchyNodeType has expected values', () => {
    expect(HierarchyNodeType.FOLDER).toBe('folder');
    expect(HierarchyNodeType.SHARED_DRIVE).toBe('shared_drive');
    expect(HierarchyNodeType.SPACE).toBe('space');
    expect(HierarchyNodeType.CHANNEL).toBe('channel');
  });
});
