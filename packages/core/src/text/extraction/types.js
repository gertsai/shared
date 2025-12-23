import { z } from 'zod';
import { EntitySchema, TripletSchema } from './schemas';
/**
 * ExtractionResult - output of entity extraction.
 * Contains entities, relationships, and processing metadata.
 */
export const ExtractionResultSchema = z.object({
    /** Extracted entities */
    entities: z.array(EntitySchema),
    /** Extracted triplets (relationships) */
    triplets: z.array(TripletSchema),
    /** Processing metadata */
    metadata: z.object({
        /** Time to process (ms) */
        processingTimeMs: z.number(),
        /** Tokens used (if LLM-based) */
        tokensUsed: z.number().optional(),
        /** Model used (if LLM-based) */
        modelUsed: z.string().optional(),
        /** Source chunk ID */
        chunkId: z.string(),
        /** Extractor version */
        extractorVersion: z.string().optional(),
    }),
});
