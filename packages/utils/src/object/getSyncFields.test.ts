import { describe, expect, it } from 'vitest';
import { chatTargetSyncFields, getSyncFields } from './getSyncFields';

describe('chatTargetSyncFields', () => {
  it('should contain expected sync fields', () => {
    const expectedFields = [
      'space_uid',
      'avatar',
      'name',
      'mute',
      'favorite',
      'members',
      'visitors',
      'editors',
      'owner_uuid',
      'assignee_uuid',
      'observers',
      'observers_uuid',
      'parent_uid',
      'project_uid',
      'context',
      'color_tag',
      'order_rank',
      'order_ranks',
      'completed_at',
      'completed_by_uuid',
      'completed_by_platform',
      'description_uid',
      'start_at',
      'end_at',
      'type',
      'progress',
      'geopoint',
      'location',
      'duration',
      'custom',
      'related',
      'checklists',
      'settings',
      'fields',
      'status',
    ];

    expectedFields.forEach((field) => {
      expect(chatTargetSyncFields).toContain(field);
    });
  });

  it('should be an array of strings', () => {
    expect(Array.isArray(chatTargetSyncFields)).toBe(true);
    chatTargetSyncFields.forEach((field) => {
      expect(typeof field).toBe('string');
    });
  });

  it('should have the correct length', () => {
    expect(chatTargetSyncFields).toHaveLength(35);
  });
});

describe('getSyncFields', () => {
  it('should filter object to include only sync fields', () => {
    const data = {
      name: 'My Chat',
      space_uid: '123',
      extra_field: 'some value',
      non_sync_field: 'should be removed',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      name: 'My Chat',
      space_uid: '123',
    });
  });

  it('should include nested field paths', () => {
    const data = {
      name: 'My Chat',
      'name.nested': 'nested value',
      'space_uid.inner': 'inner value',
      'other.field': 'should be excluded',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      name: 'My Chat',
      'name.nested': 'nested value',
      'space_uid.inner': 'inner value',
    });
  });

  it('should handle empty object', () => {
    const result = getSyncFields({});
    expect(result).toEqual({});
  });

  it('should handle object with no matching fields', () => {
    const data = {
      unknown_field: 'value1',
      another_unknown: 'value2',
    };

    const result = getSyncFields(data);
    expect(result).toEqual({});
  });

  it('should handle object with all sync fields', () => {
    const data = chatTargetSyncFields.reduce(
      (acc, field) => {
        acc[field] = `value_${field}`;
        return acc;
      },
      {} as Record<string, string>,
    );

    const result = getSyncFields(data);

    chatTargetSyncFields.forEach((field) => {
      expect(result[field]).toBe(`value_${field}`);
    });
    expect(Object.keys(result)).toHaveLength(chatTargetSyncFields.length);
  });

  it('should preserve original values and types', () => {
    const data = {
      name: 'Test Chat',
      space_uid: 123,
      mute: true,
      members: ['user1', 'user2'],
      settings: { theme: 'dark' },
      avatar: null,
      progress: 0.75,
      extra_field: 'removed',
    };

    const result = getSyncFields(data);

    expect(result.name).toBe('Test Chat');
    expect(result.space_uid).toBe(123);
    expect(result.mute).toBe(true);
    expect(result.members).toEqual(['user1', 'user2']);
    expect(result.settings).toEqual({ theme: 'dark' });
    expect(result.avatar).toBeNull();
    expect(result.progress).toBe(0.75);
    expect(result.extra_field).toBeUndefined();
  });

  it('should handle undefined and null values in sync fields', () => {
    const data = {
      name: undefined,
      space_uid: null,
      mute: false,
      extra_field: 'removed',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      name: undefined,
      space_uid: null,
      mute: false,
    });
  });

  it('should handle complex nested field paths', () => {
    const data = {
      'custom.field1': 'value1',
      'custom.field2': 'value2',
      'settings.ui.theme': 'dark',
      'settings.notifications': true,
      'non_sync.nested': 'excluded',
      'unknown.path': 'excluded',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      'custom.field1': 'value1',
      'custom.field2': 'value2',
      'settings.ui.theme': 'dark',
      'settings.notifications': true,
    });
  });

  it('should handle partial field name matches correctly', () => {
    const data = {
      name: 'included',
      name_extended: 'should be excluded', // doesn't start with "name."
      space_uid: 'included',
      space_uid_extra: 'should be excluded', // doesn't start with "space_uid."
      'name.sub': 'included',
      'space_uid.sub': 'included',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      name: 'included',
      space_uid: 'included',
      'name.sub': 'included',
      'space_uid.sub': 'included',
    });
  });

  it('should handle duplicate context field', () => {
    // The chatTargetSyncFields array has 'context' twice
    const data = {
      context: 'test context',
      'context.nested': 'nested context',
      other_field: 'excluded',
    };

    const result = getSyncFields(data);

    expect(result).toEqual({
      context: 'test context',
      'context.nested': 'nested context',
    });
  });

  it('should not mutate the original object', () => {
    const originalData = {
      name: 'Test',
      space_uid: '123',
      extra_field: 'extra',
    };
    const dataCopy = { ...originalData };

    const result = getSyncFields(originalData);

    expect(originalData).toEqual(dataCopy);
    expect(result).not.toBe(originalData);
  });

  it('should work with objects that have prototype methods', () => {
    class TestClass {
      name = 'Test';
      space_uid = '123';
      extra_field = 'extra';

      someMethod() {
        return 'method';
      }
    }

    const instance = new TestClass();
    const result = getSyncFields(instance);

    expect(result).toEqual({
      name: 'Test',
      space_uid: '123',
    });
    expect(result.someMethod).toBeUndefined();
  });

  it('should handle very large objects efficiently', () => {
    const largeData: Record<string, any> = {};

    // Add many non-sync fields
    for (let i = 0; i < 1000; i++) {
      largeData[`non_sync_field_${i}`] = `value_${i}`;
    }

    // Add some sync fields
    largeData.name = 'Test';
    largeData.space_uid = '123';
    largeData['custom.nested'] = 'nested';

    const result = getSyncFields(largeData);

    expect(result).toEqual({
      name: 'Test',
      space_uid: '123',
      'custom.nested': 'nested',
    });
    expect(Object.keys(result)).toHaveLength(3);
  });
});
