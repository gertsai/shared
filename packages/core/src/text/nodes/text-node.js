import { z } from 'zod';
import { createId } from '../../ids';
export const TextNodeMetadataSchema = z
    .object({
    chunk_index: z.number().int().min(0),
    total_chunks: z.number().int().min(1).optional(),
    chunk_method: z
        .enum(['character', 'recursive', 'sentence', 'token', 'markdown', 'html', 'code', 'semantic'])
        .optional(),
    chunk_overlap: z.number().int().min(0).optional(),
    start_index: z.number().int().min(0),
    end_index: z.number().int().min(0).optional(),
    startCharIdx: z.number().int().min(0).optional(),
    endCharIdx: z.number().int().min(0).optional(),
    doc_id: z.string(),
    doc_path: z.string().optional(),
    Header_1: z.string().optional(),
    Header_2: z.string().optional(),
    Header_3: z.string().optional(),
    section_path: z.string().optional(),
})
    .passthrough();
export const TextNodeRelatedNodeInfoSchema = z.object({
    nodeId: z.string(),
    nodeType: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export const TextNodeSchema = z.object({
    id: z.string(),
    text: z.string(),
    metadata: TextNodeMetadataSchema,
    embedding: z.array(z.number()).optional(),
    relationships: z.record(z.string(), TextNodeRelatedNodeInfoSchema).optional(),
});
export function createTextNode(text, metadata, relationships) {
    return {
        id: createId('chunk'),
        text,
        metadata,
        relationships,
    };
}
