/**
 * Data Connectors System (RFC-042)
 *
 * This module exports ACL models and utilities for the connector system:
 * - ACL prefix utilities for consistent string formatting
 * - ExternalAccess/DocumentAccess models for permission handling
 * - Status enums for indexing and sync operations
 * - IdentityResolver interface for external → internal identity mapping
 */

export * from './acl';
export * from './enums';
// NOTE: identity-resolver was untracked in gertsai_codex due to a global
// `connectors/` .gitignore pattern. Restore in v0.1.x once the source is
// re-committed upstream with proper history. See ADR-006 / EPIC-007.
// export * from './identity-resolver';
