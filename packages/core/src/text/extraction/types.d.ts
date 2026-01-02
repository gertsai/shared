import { z } from 'zod';
/**
 * ExtractionResult - output of entity extraction.
 * Contains entities, relationships, and processing metadata.
 */
export declare const ExtractionResultSchema: z.ZodObject<{
    /** Extracted entities */
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
        customType: z.ZodOptional<z.ZodString>;
        aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        confidence: z.ZodNumber;
        sourceChunkId: z.ZodString;
        mentions: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            startIndex: z.ZodNumber;
            endIndex: z.ZodNumber;
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
        embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
        id: string;
        name: string;
        confidence: number;
        aliases: string[];
        properties: Record<string, unknown>;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        embedding?: number[] | undefined;
        customType?: string | undefined;
    }, {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
        embedding?: number[] | undefined;
        customType?: string | undefined;
        aliases?: string[] | undefined;
        properties?: Record<string, unknown> | undefined;
    }>, "many">;
    /** Extracted triplets (relationships) */
    triplets: z.ZodArray<z.ZodObject<{
        subject: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
            customType: z.ZodOptional<z.ZodString>;
            aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            confidence: z.ZodNumber;
            sourceChunkId: z.ZodString;
            mentions: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                startIndex: z.ZodNumber;
                endIndex: z.ZodNumber;
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
            embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        }, "strip", z.ZodTypeAny, {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        }, {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        }>;
        predicate: z.ZodObject<{
            type: z.ZodString;
            properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            confidence: z.ZodNumber;
            evidence: z.ZodOptional<z.ZodString>;
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
        object: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "EVENT", "CONCEPT", "PRODUCT", "DATE", "QUANTITY", "CUSTOM"]>;
            customType: z.ZodOptional<z.ZodString>;
            aliases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            properties: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            confidence: z.ZodNumber;
            sourceChunkId: z.ZodString;
            mentions: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                startIndex: z.ZodNumber;
                endIndex: z.ZodNumber;
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
            embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        }, "strip", z.ZodTypeAny, {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        }, {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        }>;
        sourceChunkId: z.ZodString;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        object: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        };
        confidence: number;
        sourceChunkId: string;
        subject: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        };
        predicate: {
            type: string;
            confidence: number;
            properties: Record<string, unknown>;
            evidence?: string | undefined;
            direction?: "forward" | "backward" | "bidirectional" | undefined;
        };
    }, {
        object: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        };
        confidence: number;
        sourceChunkId: string;
        subject: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        };
        predicate: {
            type: string;
            confidence: number;
            properties?: Record<string, unknown> | undefined;
            evidence?: string | undefined;
            direction?: "forward" | "backward" | "bidirectional" | undefined;
        };
    }>, "many">;
    /** Processing metadata */
    metadata: z.ZodObject<{
        /** Time to process (ms) */
        processingTimeMs: z.ZodNumber;
        /** Tokens used (if LLM-based) */
        tokensUsed: z.ZodOptional<z.ZodNumber>;
        /** Model used (if LLM-based) */
        modelUsed: z.ZodOptional<z.ZodString>;
        /** Source chunk ID */
        chunkId: z.ZodString;
        /** Extractor version */
        extractorVersion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        processingTimeMs: number;
        chunkId: string;
        tokensUsed?: number | undefined;
        modelUsed?: string | undefined;
        extractorVersion?: string | undefined;
    }, {
        processingTimeMs: number;
        chunkId: string;
        tokensUsed?: number | undefined;
        modelUsed?: string | undefined;
        extractorVersion?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    triplets: {
        object: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        };
        confidence: number;
        sourceChunkId: string;
        subject: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
            id: string;
            name: string;
            confidence: number;
            aliases: string[];
            properties: Record<string, unknown>;
            sourceChunkId: string;
            mentions: {
                text: string;
                startIndex: number;
                endIndex: number;
                confidence?: number | undefined;
            }[];
            embedding?: number[] | undefined;
            customType?: string | undefined;
        };
        predicate: {
            type: string;
            confidence: number;
            properties: Record<string, unknown>;
            evidence?: string | undefined;
            direction?: "forward" | "backward" | "bidirectional" | undefined;
        };
    }[];
    metadata: {
        processingTimeMs: number;
        chunkId: string;
        tokensUsed?: number | undefined;
        modelUsed?: string | undefined;
        extractorVersion?: string | undefined;
    };
    entities: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
        id: string;
        name: string;
        confidence: number;
        aliases: string[];
        properties: Record<string, unknown>;
        sourceChunkId: string;
        mentions: {
            text: string;
            startIndex: number;
            endIndex: number;
            confidence?: number | undefined;
        }[];
        embedding?: number[] | undefined;
        customType?: string | undefined;
    }[];
}, {
    triplets: {
        object: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        };
        confidence: number;
        sourceChunkId: string;
        subject: {
            type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
            embedding?: number[] | undefined;
            customType?: string | undefined;
            aliases?: string[] | undefined;
            properties?: Record<string, unknown> | undefined;
        };
        predicate: {
            type: string;
            confidence: number;
            properties?: Record<string, unknown> | undefined;
            evidence?: string | undefined;
            direction?: "forward" | "backward" | "bidirectional" | undefined;
        };
    }[];
    metadata: {
        processingTimeMs: number;
        chunkId: string;
        tokensUsed?: number | undefined;
        modelUsed?: string | undefined;
        extractorVersion?: string | undefined;
    };
    entities: {
        type: "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" | "CONCEPT" | "PRODUCT" | "DATE" | "QUANTITY" | "CUSTOM";
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
        embedding?: number[] | undefined;
        customType?: string | undefined;
        aliases?: string[] | undefined;
        properties?: Record<string, unknown> | undefined;
    }[];
}>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type { Entity, Triplet, Mention, EntityType, Predicate } from './schemas';
