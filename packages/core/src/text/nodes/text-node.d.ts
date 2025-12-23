import { z } from 'zod';
export declare const TextNodeMetadataSchema: z.ZodObject<{
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
export type TextNodeMetadata = z.infer<typeof TextNodeMetadataSchema>;
export declare const TextNodeRelatedNodeInfoSchema: z.ZodObject<{
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
}>;
export type TextNodeRelatedNodeInfo = z.infer<typeof TextNodeRelatedNodeInfoSchema>;
export declare const TextNodeSchema: z.ZodObject<{
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
    metadata: {
        chunk_index: number;
        start_index: number;
        doc_id: string;
        Header_1?: string | undefined;
        Header_2?: string | undefined;
        Header_3?: string | undefined;
        section_path?: string | undefined;
        total_chunks?: number | undefined;
        chunk_method?: "code" | "token" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
        chunk_overlap?: number | undefined;
        end_index?: number | undefined;
        startCharIdx?: number | undefined;
        endCharIdx?: number | undefined;
        doc_path?: string | undefined;
    } & {
        [k: string]: unknown;
    };
    text: string;
    embedding?: number[] | undefined;
    relationships?: Record<string, {
        nodeId: string;
        metadata?: Record<string, unknown> | undefined;
        nodeType?: string | undefined;
    }> | undefined;
}, {
    id: string;
    metadata: {
        chunk_index: number;
        start_index: number;
        doc_id: string;
        Header_1?: string | undefined;
        Header_2?: string | undefined;
        Header_3?: string | undefined;
        section_path?: string | undefined;
        total_chunks?: number | undefined;
        chunk_method?: "code" | "token" | "character" | "recursive" | "sentence" | "markdown" | "html" | "semantic" | undefined;
        chunk_overlap?: number | undefined;
        end_index?: number | undefined;
        startCharIdx?: number | undefined;
        endCharIdx?: number | undefined;
        doc_path?: string | undefined;
    } & {
        [k: string]: unknown;
    };
    text: string;
    embedding?: number[] | undefined;
    relationships?: Record<string, {
        nodeId: string;
        metadata?: Record<string, unknown> | undefined;
        nodeType?: string | undefined;
    }> | undefined;
}>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export declare function createTextNode(text: string, metadata: TextNodeMetadata, relationships?: TextNode['relationships']): TextNode;
//# sourceMappingURL=text-node.d.ts.map