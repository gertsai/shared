// SPDX-License-Identifier: Apache-2.0

/**
 * Backend-agnostic timestamp shape.
 * Matches Firestore Timestamp + entity-audit canonical structure.
 * Adapter-side conversion to SQL TIMESTAMPTZ via {@link timestampToMillis}.
 */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
}

/**
 * Generic mutation marks WITHOUT session-bound builders.
 * For session-augmented variant (creator_uuid, *_by_platform, lifecycle
 * builders), see `@gertsai/entity-audit` `MutationMarks`.
 */
export interface AuditMarks {
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
  readonly deleted_at?: Timestamp;
}
