// SPDX-License-Identifier: Apache-2.0

export type {
  Direction,
  EndAtConstraint,
  EndBeforeConstraint,
  LimitConstraint,
  LimitToLastConstraint,
  OffsetConstraint,
  OrderByConstraint,
  Query,
  QueryConstraint,
  StartAfterConstraint,
  StartAtConstraint,
  WhereConstraint,
  WhereOp,
} from './types';

export {
  defineQueryConstraints,
  endAt,
  endBefore,
  limit,
  limitToLast,
  offset,
  orderBy,
  startAfter,
  startAt,
  whereField,
} from './constraints';

export type { BoundQueryConstraints } from './constraints';

export { validateQuery } from './validate';

export {
  FULL_QUERY_CAPABILITIES,
  IN_MEMORY_QUERY_CAPABILITIES,
  MINIMAL_QUERY_CAPABILITIES,
  POSTGRES_QUERY_CAPABILITIES,
} from './capabilities';
export type { QueryCapabilities } from './capabilities';
