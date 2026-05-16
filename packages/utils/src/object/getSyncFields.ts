/**
 * An array of fields that should be synced for chat targets.
 */
export const chatTargetSyncFields = [
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
  // 'tags',
  // 'priority',
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

/**
 * Filters an object to include only the fields that should be synced for chat targets.
 *
 * @param data - The object to filter.
 * @returns A new object with only the syncable fields.
 *
 * @example
 * ```typescript
 * const data = {
 *   name: 'My Chat',
 *   space_uid: '123',
 *   extra_field: 'some value',
 * };
 *
 * const syncableData = getSyncFields(data);
 * // syncableData is { name: 'My Chat', space_uid: '123' }
 * ```
 */
export const getSyncFields = <T extends Record<string, unknown>>(
  data: T,
): Partial<T> =>
  Object.keys(data)
    .filter((key) =>
      chatTargetSyncFields.some(
        (field) => key === field || key.startsWith(field + '.'),
      ),
    )
    .reduce((obj, key) => {
      (obj as Record<string, unknown>)[key] = data[key];
      return obj;
    }, {} as Partial<T>);
