"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripletSchema = exports.PredicateSchema = exports.EntitySchema = exports.MentionSchema = exports.EntityTypeSchema = void 0;
const zod_1 = require("zod");
/**
 * Entity types for Graph RAG.
 * Extensible via custom types.
 */
exports.EntityTypeSchema = zod_1.z.enum([
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
/**
 * Mention - where entity appears in source text.
 * Enables citations and provenance tracking.
 */
exports.MentionSchema = zod_1.z.object({
    /** Exact text of mention */
    text: zod_1.z.string(),
    /** Character start in chunk */
    startIndex: zod_1.z.number().int().min(0),
    /** Character end in chunk */
    endIndex: zod_1.z.number().int().min(0),
    /** Confidence of this specific mention (0-1) */
    confidence: zod_1.z.number().min(0).max(1).optional(),
});
/**
 * Entity - extracted named entity.
 * Core building block for knowledge graphs.
 */
exports.EntitySchema = zod_1.z.object({
    /** Unique ID (UUID) */
    id: zod_1.z.string().uuid(),
    /** Canonical name */
    name: zod_1.z.string().min(1).max(500),
    /** Entity type */
    type: exports.EntityTypeSchema,
    /** Custom type if type === 'CUSTOM' */
    customType: zod_1.z.string().optional(),
    /** Alternative names (aliases, abbreviations) */
    aliases: zod_1.z.array(zod_1.z.string()).default([]),
    /** Structured properties (domain-specific metadata) */
    properties: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    /** Extraction confidence (0-1) */
    confidence: zod_1.z.number().min(0).max(1),
    /** Source chunk ID for provenance */
    sourceChunkId: zod_1.z.string(),
    /** All mentions in source text */
    mentions: zod_1.z.array(exports.MentionSchema).min(1),
    /** Optional embedding vector for semantic deduplication */
    embedding: zod_1.z.array(zod_1.z.number()).optional(),
});
/**
 * Predicate - relationship type between entities.
 * Represents edges in the knowledge graph.
 */
exports.PredicateSchema = zod_1.z.object({
    /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') */
    type: zod_1.z.string().min(1).max(100),
    /** Relationship properties (metadata, temporal info) */
    properties: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    /** Confidence of relationship (0-1) */
    confidence: zod_1.z.number().min(0).max(1),
    /** Evidence text from source supporting this relationship */
    evidence: zod_1.z.string().optional(),
    /** Optional direction hint for asymmetric relationships */
    direction: zod_1.z.enum(['forward', 'backward', 'bidirectional']).optional(),
});
/**
 * Triplet - subject-predicate-object relationship.
 * Complete knowledge graph edge with nodes.
 */
exports.TripletSchema = zod_1.z.object({
    /** Subject entity (source) */
    subject: exports.EntitySchema,
    /** Relationship (edge) */
    predicate: exports.PredicateSchema,
    /** Object entity (target) */
    object: exports.EntitySchema,
    /** Source chunk ID for provenance */
    sourceChunkId: zod_1.z.string(),
    /** Overall confidence (product of entity + predicate confidence) */
    confidence: zod_1.z.number().min(0).max(1),
});
//# sourceMappingURL=schemas.js.map