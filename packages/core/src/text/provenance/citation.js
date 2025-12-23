import { z } from 'zod';
/**
 * Citation - link from graph node back to source.
 * Enables transparent, explainable Graph RAG responses.
 */
export const CitationSchema = z.object({
    /** Unique citation ID */
    id: z.string(),
    /** Source document info */
    sourceDocument: z.object({
        id: z.string(),
        path: z.string().optional(),
        name: z.string().optional(),
        url: z.string().url().optional(),
    }),
    /** Source chunk info */
    chunk: z.object({
        id: z.string(),
        startIndex: z.number(),
        endIndex: z.number(),
        text: z.string(),
    }),
    /** Entity being cited (optional) */
    entity: z
        .object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
    })
        .optional(),
    /** Confidence of citation relevance */
    confidence: z.number().min(0).max(1),
});
