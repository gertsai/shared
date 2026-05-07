// SPDX-License-Identifier: Apache-2.0
export {
  defaultTimestampProvider,
  timestampToMillis,
  timestampFromDate,
} from './timestamp';
export type { TimestampProvider } from './timestamp';
export {
  buildDataForSet,
  buildDataForUpdate,
  buildDataForDelete,
  buildDataForRestore,
} from './builders';
export type { BuilderOpts, SetBuilderOpts, UpdateOpts } from './builders';
export type {
  Timestamp,
  MutationMarks,
  UpdateAction,
  UpdateActionMap,
  UpdateActionType,
  UpdateActionGeneric,
  UnionToIntersection,
  EntityBasicStatus,
  EntityData,
  EntityDataCreate,
  EntityDataUpdate,
  EntityMetaType,
} from './types';
