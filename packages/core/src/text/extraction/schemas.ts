import { z } from 'zod';

/**
 * Entity types for Graph RAG.
 * Extensible via custom types.
 */
export const EntityTypeSchema = z.enum([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
  'EVENT',
  'CONCEPT',
  'PRODUCT',
  'DATE',
  'QUANTITY',
  'CUSTOM',
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Mention - where entity appears in source text.
 * Enables citations and provenance tracking.
 */
export const MentionSchema = z.object({
  /** Exact text of mention */
  text: z.string(),

  /** Character start in chunk */
  startIndex: z.number().int().min(0),

  /** Character end in chunk */
  endIndex: z.number().int().min(0),

  /** Confidence of this specific mention (0-1) */
  confidence: z.number().min(0).max(1).optional(),
});

export type Mention = z.infer<typeof MentionSchema>;

/**
 * Entity - extracted named entity.
 * Core building block for knowledge graphs.
 */
export const EntitySchema = z.object({
  /** Unique ID (UUID) */
  id: z.string().uuid(),

  /** Canonical name */
  name: z.string().min(1).max(500),

  /** Entity type */
  type: EntityTypeSchema,

  /** Custom type if type === 'CUSTOM' */
  customType: z.string().optional(),

  /** Alternative names (aliases, abbreviations) */
  aliases: z.array(z.string()).default([]),

  /** Structured properties (domain-specific metadata) */
  properties: z.record(z.string(), z.unknown()).default({}),

  /** Extraction confidence (0-1) */
  confidence: z.number().min(0).max(1),

  /** Source chunk ID for provenance */
  sourceChunkId: z.string(),

  /** All mentions in source text */
  mentions: z.array(MentionSchema).min(1),

  /** Optional embedding vector for semantic deduplication */
  embedding: z.array(z.number()).optional(),
});

export type Entity = z.infer<typeof EntitySchema>;

/**
 * Predicate - relationship type between entities.
 * Represents edges in the knowledge graph.
 */
export const PredicateSchema = z.object({
  /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') */
  type: z.string().min(1).max(100),

  /** Relationship properties (metadata, temporal info) */
  properties: z.record(z.string(), z.unknown()).default({}),

  /** Confidence of relationship (0-1) */
  confidence: z.number().min(0).max(1),

  /** Evidence text from source supporting this relationship */
  evidence: z.string().optional(),

  /** Optional direction hint for asymmetric relationships */
  direction: z.enum(['forward', 'backward', 'bidirectional']).optional(),
});

export type Predicate = z.infer<typeof PredicateSchema>;

/**
 * Triplet - subject-predicate-object relationship.
 * Complete knowledge graph edge with nodes.
 */
export const TripletSchema = z.object({
  /** Subject entity (source) */
  subject: EntitySchema,

  /** Relationship (edge) */
  predicate: PredicateSchema,

  /** Object entity (target) */
  object: EntitySchema,

  /** Source chunk ID for provenance */
  sourceChunkId: z.string(),

  /** Overall confidence (product of entity + predicate confidence) */
  confidence: z.number().min(0).max(1),
});

export type Triplet = z.infer<typeof TripletSchema>;
