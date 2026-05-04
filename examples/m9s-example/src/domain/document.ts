/**
 * Document — domain entity.
 *
 * Pure domain type. No transport, no infra concerns.
 * Imports nothing except (optionally) shared primitives from @gertsai/core.
 */
export interface DocumentMetadata {
  /** Optional source URL or filesystem origin */
  source?: string;
  /** Free-form tags for filtering */
  tags?: string[];
  /** Author or owning user identifier */
  author?: string;
  /** Created-at timestamp (ISO-8601) */
  createdAt?: string;
}

/**
 * A document is the unit of ingestion. After ingestion it is broken down
 * into chunks that get embedded and stored.
 */
export interface Document {
  /** Stable, caller-supplied identifier (must be unique per store) */
  readonly id: string;
  /** Raw text body */
  readonly text: string;
  /** Optional metadata bag */
  readonly metadata?: DocumentMetadata;
}

/**
 * Factory helper. Performs minimal invariant checks so that the
 * domain layer can be trusted by use cases without re-validating.
 */
export const createDocument = (input: Document): Document => {
  if (!input.id || input.id.trim().length === 0) {
    throw new Error('Document.id must be non-empty');
  }
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('Document.text must be non-empty');
  }
  return {
    id: input.id,
    text: input.text,
    metadata: input.metadata,
  };
};
