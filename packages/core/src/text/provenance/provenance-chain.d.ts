import { z } from 'zod';
/**
 * GraphEdge - edge in knowledge graph.
 */
export declare const GraphEdgeSchema: z.ZodObject<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
    weight: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: string;
    sourceId: string;
    targetId: string;
    weight?: number | undefined;
}, {
    type: string;
    sourceId: string;
    targetId: string;
    weight?: number | undefined;
}>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
/**
 * ProvenanceChain - complete path from query to answer.
 * For transparent, explainable Graph RAG responses.
 */
export declare const ProvenanceChainSchema: z.ZodObject<{
    /** Original query */
    query: z.ZodString;
    /** Retrieved chunks */
    retrievedChunks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        metadata: z.ZodObject<{
            chunk_index: z.ZodNumber;
            total_chunks: z.ZodOptional<z.ZodNumber>;
            chunk_method: z.ZodOptional<z.ZodEnum<["character", "recursive", "sentence", "token", "markdown", "html", "code", "semantic"]>>;
            chunk_overlap: z.ZodOptional<z.ZodNumber>;
            start_index: z.ZodNumber;
            end_index: z.ZodOptional<z.ZodNumber>;
            startCharIdx: z.ZodOptional<z.ZodNumber>;
            endCharIdx: z.ZodOptional<z.ZodNumber>;
            doc_id: z.ZodString;
            doc_path: z.ZodOptional<z.ZodString>;
            Header_1: z.ZodOptional<z.ZodString>;
            Header_2: z.ZodOptional<z.ZodString>;
            Header_3: z.ZodOptional<z.ZodString>;
            section_path: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            chunk_index: z.ZodNumber;
            total_chunks: z.ZodOptional<z.ZodNumber>;
            chunk_method: z.ZodOptional<z.ZodEnum<["character", "recursive", "sentence", "token", "markdown", "html", "code", "semantic"]>>;
            chunk_overlap: z.ZodOptional<z.ZodNumber>;
            start_index: z.ZodNumber;
            end_index: z.ZodOptional<z.ZodNumber>;
            startCharIdx: z.ZodOptional<z.ZodNumber>;
            endCharIdx: z.ZodOptional<z.ZodNumber>;
            doc_id: z.ZodString;
            doc_path: z.ZodOptional<z.ZodString>;
            Header_1: z.ZodOptional<z.ZodString>;
            Header_2: z.ZodOptional<z.ZodString>;
            Header_3: z.ZodOptional<z.ZodString>;
            section_path: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            chunk_index: z.ZodNumber;
            total_chunks: z.ZodOptional<z.ZodNumber>;
            chunk_method: z.ZodOptional<z.ZodEnum<["character", "recursive", "sentence", "token", "markdown", "html", "code", "semantic"]>>;
            chunk_overlap: z.ZodOptional<z.ZodNumber>;
            start_index: z.ZodNumber;
            end_index: z.ZodOptional<z.ZodNumber>;
            startCharIdx: z.ZodOptional<z.ZodNumber>;
            endCharIdx: z.ZodOptional<z.ZodNumber>;
            doc_id: z.ZodString;
            doc_path: z.ZodOptional<z.ZodString>;
            Header_1: z.ZodOptional<z.ZodString>;
            Header_2: z.ZodOptional<z.ZodString>;
            Header_3: z.ZodOptional<z.ZodString>;
            section_path: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>;
        embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        relationships: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            nodeId: z.ZodString;
            nodeType: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        metadata: {
            chunk_index: number;
            start_index: number;
            doc_id: string;
            Header_1?: string | undefined;
            Header_2?: string | undefined;
            Header_3?: string | undefined;
            section_path?: string | undefined;
            total_chunks?: number | undefined;
            chunk_method?: "token" | "code" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
            chunk_overlap?: number | undefined;
            end_index?: number | undefined;
            startCharIdx?: number | undefined;
            endCharIdx?: number | undefined;
            doc_path?: string | undefined;
        } & {
            [k: string]: unknown;
        };
        embedding?: number[] | undefined;
        relationships?: Record<string, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }> | undefined;
    }, {
        id: string;
        text: string;
        metadata: {
            chunk_index: number;
            start_index: number;
            doc_id: string;
            Header_1?: string | undefined;
            Header_2?: string | undefined;
            Header_3?: string | undefined;
            section_path?: string | undefined;
            total_chunks?: number | undefined;
            chunk_method?: "token" | "code" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
            chunk_overlap?: number | undefined;
            end_index?: number | undefined;
            startCharIdx?: number | undefined;
            endCharIdx?: number | undefined;
            doc_path?: string | undefined;
        } & {
            [k: string]: unknown;
        };
        embedding?: number[] | undefined;
        relationships?: Record<string, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }> | undefined;
    }>, "many">;
    /** Extracted entities */
    extractedEntities: z.ZodArray<z.ZodObject<{
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
    /** Graph traversal path */
    graphPath: z.ZodArray<z.ZodObject<{
        sourceId: z.ZodString;
        targetId: z.ZodString;
        type: z.ZodString;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        sourceId: string;
        targetId: string;
        weight?: number | undefined;
    }, {
        type: string;
        sourceId: string;
        targetId: string;
        weight?: number | undefined;
    }>, "many">;
    /** Final citations */
    citations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        sourceDocument: z.ZodObject<{
            id: z.ZodString;
            path: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        }, {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        }>;
        chunk: z.ZodObject<{
            id: z.ZodString;
            startIndex: z.ZodNumber;
            endIndex: z.ZodNumber;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        }, {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        }>;
        entity: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: string;
            name: string;
        }, {
            type: string;
            id: string;
            name: string;
        }>>;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        chunk: {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        };
        confidence: number;
        sourceDocument: {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        };
        entity?: {
            type: string;
            id: string;
            name: string;
        } | undefined;
    }, {
        id: string;
        chunk: {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        };
        confidence: number;
        sourceDocument: {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        };
        entity?: {
            type: string;
            id: string;
            name: string;
        } | undefined;
    }>, "many">;
    /** Timestamps */
    createdAt: z.ZodString;
    processingTimeMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    query: string;
    retrievedChunks: {
        id: string;
        text: string;
        metadata: {
            chunk_index: number;
            start_index: number;
            doc_id: string;
            Header_1?: string | undefined;
            Header_2?: string | undefined;
            Header_3?: string | undefined;
            section_path?: string | undefined;
            total_chunks?: number | undefined;
            chunk_method?: "token" | "code" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
            chunk_overlap?: number | undefined;
            end_index?: number | undefined;
            startCharIdx?: number | undefined;
            endCharIdx?: number | undefined;
            doc_path?: string | undefined;
        } & {
            [k: string]: unknown;
        };
        embedding?: number[] | undefined;
        relationships?: Record<string, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }> | undefined;
    }[];
    extractedEntities: {
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
    graphPath: {
        type: string;
        sourceId: string;
        targetId: string;
        weight?: number | undefined;
    }[];
    citations: {
        id: string;
        chunk: {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        };
        confidence: number;
        sourceDocument: {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        };
        entity?: {
            type: string;
            id: string;
            name: string;
        } | undefined;
    }[];
    createdAt: string;
    processingTimeMs: number;
}, {
    query: string;
    retrievedChunks: {
        id: string;
        text: string;
        metadata: {
            chunk_index: number;
            start_index: number;
            doc_id: string;
            Header_1?: string | undefined;
            Header_2?: string | undefined;
            Header_3?: string | undefined;
            section_path?: string | undefined;
            total_chunks?: number | undefined;
            chunk_method?: "token" | "code" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
            chunk_overlap?: number | undefined;
            end_index?: number | undefined;
            startCharIdx?: number | undefined;
            endCharIdx?: number | undefined;
            doc_path?: string | undefined;
        } & {
            [k: string]: unknown;
        };
        embedding?: number[] | undefined;
        relationships?: Record<string, {
            nodeId: string;
            metadata?: Record<string, unknown> | undefined;
            nodeType?: string | undefined;
        }> | undefined;
    }[];
    extractedEntities: {
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
    graphPath: {
        type: string;
        sourceId: string;
        targetId: string;
        weight?: number | undefined;
    }[];
    citations: {
        id: string;
        chunk: {
            id: string;
            text: string;
            startIndex: number;
            endIndex: number;
        };
        confidence: number;
        sourceDocument: {
            id: string;
            name?: string | undefined;
            path?: string | undefined;
            url?: string | undefined;
        };
        entity?: {
            type: string;
            id: string;
            name: string;
        } | undefined;
    }[];
    createdAt: string;
    processingTimeMs: number;
}>;
export type ProvenanceChain = z.infer<typeof ProvenanceChainSchema>;
