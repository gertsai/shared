import { z } from 'zod';
/**
 * Entity types for Graph RAG.
 * Extensible via custom types.
 */
export declare const EntityTypeSchema: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
export type EntityType = z.infer<typeof EntityTypeSchema>;
/**
 * Mention - where entity appears in source text.
 * Enables citations and provenance tracking.
 */
export declare const MentionSchema: z.ZodObject<{
    /** Exact text of mention */
    text: z.ZodString;
    /** Character start in chunk */
    startIndex: z.ZodNumber;
    /** Character end in chunk */
    endIndex: z.ZodNumber;
    /** Confidence of this specific mention (0-1) */
    confidence: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    text: string;
    startIndex: number;
    endIndex: number;
    confidence?: number | undefined;
}, {
    text: string;
    startIndex: number;
    endIndex: number;
    confidence?: number | undefined;
}>;
export type Mention = z.infer<typeof MentionSchema>;
/**
 * Entity - extracted named entity.
 * Core building block for knowledge graphs.
 */
export declare const EntitySchema: z.ZodObject<{
    /** Unique ID (UUID) */
    id: z.ZodString;
    /** Canonical name */
    name: z.ZodString;
    /** Entity type */
    type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
    /** Custom type if type === 'CUSTOM' */
    customType: z.ZodOptional<z.ZodString>;
    /** Alternative names (aliases, abbreviations) */
    aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Structured properties (domain-specific metadata) */
    properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** Extraction confidence (0-1) */
    confidence: z.ZodNumber;
    /** Source chunk ID for provenance */
    sourceChunkId: z.ZodString;
    /** All mentions in source text */
    mentions: z.ZodArray<z.ZodObject<{
        /** Exact text of mention */
        text: z.ZodString;
        /** Character start in chunk */
        startIndex: z.ZodNumber;
        /** Character end in chunk */
        endIndex: z.ZodNumber;
        /** Confidence of this specific mention (0-1) */
        confidence: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        startIndex: number;
        endIndex: number;
        confidence?: number | undefined;
    }, {
        text: string;
        startIndex: number;
        endIndex: number;
        confidence?: number | undefined;
    }>, "many">;
    /** Optional embedding vector for semantic deduplication */
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
    id: string;
    name: string;
    confidence: number;
    properties: Record<string, unknown>;
    aliases: string[];
    sourceChunkId: string;
    mentions: {
        text: string;
        startIndex: number;
        endIndex: number;
        confidence?: number | undefined;
    }[];
    customType?: string | undefined;
    embedding?: number[] | undefined;
}, {
    type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
    id: string;
    name: string;
    confidence: number;
    sourceChunkId: string;
    mentions: {
        text: string;
        startIndex: number;
        endIndex: number;
        confidence?: number | undefined;
    }[];
    customType?: string | undefined;
    embedding?: number[] | undefined;
    properties?: Record<string, unknown> | undefined;
    aliases?: string[] | undefined;
}>;
export type Entity = z.infer<typeof EntitySchema>;
/**
 * Predicate - relationship type between entities.
 * Represents edges in the knowledge graph.
 */
export declare const PredicateSchema: z.ZodObject<{
    /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') */
    type: z.ZodString;
    /** Relationship properties (metadata, temporal info) */
    properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** Confidence of relationship (0-1) */
    confidence: z.ZodNumber;
    /** Evidence text from source supporting this relationship */
    evidence: z.ZodOptional<z.ZodString>;
    /** Optional direction hint for asymmetric relationships */
    direction: z.ZodOptional<z.ZodEnum<["forward", "backward", "bidirectional"]>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    confidence: number;
    properties: Record<string, unknown>;
    evidence?: string | undefined;
    direction?: "forward" | "backward" | "bidirectional" | undefined;
}, {
    type: string;
    confidence: number;
    properties?: Record<string, unknown> | undefined;
    evidence?: string | undefined;
    direction?: "forward" | "backward" | "bidirectional" | undefined;
}>;
export type Predicate = z.infer<typeof PredicateSchema>;
/**
 * Triplet - subject-predicate-object relationship.
 * Complete knowledge graph edge with nodes.
 */
export declare const TripletSchema: z.ZodObject<{
    /** Subject entity (source) */
    subject: z.ZodObject<{
        /** Unique ID (UUID) */
        id: z.ZodString;
        /** Canonical name */
        name: z.ZodString;
        /** Entity type */
        type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
        /** Custom type if type === 'CUSTOM' */
        customType: z.ZodOptional<z.ZodString>;
        /** Alternative names (aliases, abbreviations) */
        aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Structured properties (domain-specific metadata) */
        properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        /** Extraction confidence (0-1) */
        confidence: z.ZodNumber;
        /** Source chunk ID for provenance */
        sourceChunkId: z.ZodString;
        /** All mentions in source text */
        mentions: z.ZodArray<z.ZodObject<{
            /** Exact text of mention */
            text: z.ZodString;
            /** Character start in chunk */
            startIndex: z.ZodNumber;
            /** Character end in chunk */
            endIndex: z.ZodNumber;
            /** Confidence of this specific mention (0-1) */
            confidence: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }, {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }>, "many">;
        /** Optional embedding vector for semantic deduplication */
        embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        properties: Record<string, unknown>;
        aliases: string[];
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
    }, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
        properties?: Record<string, unknown> | undefined;
        aliases?: string[] | undefined;
    }>;
    /** Relationship (edge) */
    predicate: z.ZodObject<{
        /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') */
        type: z.ZodString;
        /** Relationship properties (metadata, temporal info) */
        properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        /** Confidence of relationship (0-1) */
        confidence: z.ZodNumber;
        /** Evidence text from source supporting this relationship */
        evidence: z.ZodOptional<z.ZodString>;
        /** Optional direction hint for asymmetric relationships */
        direction: z.ZodOptional<z.ZodEnum<["forward", "backward", "bidirectional"]>>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        confidence: number;
        properties: Record<string, unknown>;
        evidence?: string | undefined;
        direction?: "forward" | "backward" | "bidirectional" | undefined;
    }, {
        type: string;
        confidence: number;
        properties?: Record<string, unknown> | undefined;
        evidence?: string | undefined;
        direction?: "forward" | "backward" | "bidirectional" | undefined;
    }>;
    /** Object entity (target) */
    object: z.ZodObject<{
        /** Unique ID (UUID) */
        id: z.ZodString;
        /** Canonical name */
        name: z.ZodString;
        /** Entity type */
        type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
        /** Custom type if type === 'CUSTOM' */
        customType: z.ZodOptional<z.ZodString>;
        /** Alternative names (aliases, abbreviations) */
        aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Structured properties (domain-specific metadata) */
        properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        /** Extraction confidence (0-1) */
        confidence: z.ZodNumber;
        /** Source chunk ID for provenance */
        sourceChunkId: z.ZodString;
        /** All mentions in source text */
        mentions: z.ZodArray<z.ZodObject<{
            /** Exact text of mention */
            text: z.ZodString;
            /** Character start in chunk */
            startIndex: z.ZodNumber;
            /** Character end in chunk */
            endIndex: z.ZodNumber;
            /** Confidence of this specific mention (0-1) */
            confidence: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }, {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }>, "many">;
        /** Optional embedding vector for semantic deduplication */
        embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        properties: Record<string, unknown>;
        aliases: string[];
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
    }, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
        properties?: Record<string, unknown> | undefined;
        aliases?: string[] | undefined;
    }>;
    /** Source chunk ID for provenance */
    sourceChunkId: z.ZodString;
    /** Overall confidence (product of entity + predicate confidence) */
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    object: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        properties: Record<string, unknown>;
        aliases: string[];
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
    };
    confidence: number;
    subject: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        properties: Record<string, unknown>;
        aliases: string[];
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
    };
    predicate: {
        type: string;
        confidence: number;
        properties: Record<string, unknown>;
        evidence?: string | undefined;
        direction?: "forward" | "backward" | "bidirectional" | undefined;
    };
    sourceChunkId: string;
}, {
    object: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
        properties?: Record<string, unknown> | undefined;
        aliases?: string[] | undefined;
    };
    confidence: number;
    subject: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "CUSTOM" | "QUANTITY";
        id: string;
        name: string;
        confidence: number;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        customType?: string | undefined;
        embedding?: number[] | undefined;
        properties?: Record<string, unknown> | undefined;
        aliases?: string[] | undefined;
    };
    predicate: {
        type: string;
        confidence: number;
        properties?: Record<string, unknown> | undefined;
        evidence?: string | undefined;
        direction?: "forward" | "backward" | "bidirectional" | undefined;
    };
    sourceChunkId: string;
}>;
export type Triplet = z.infer<typeof TripletSchema>;
//# sourceMappingURL=schemas.d.ts.map