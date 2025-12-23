import { z } from 'zod';
import { CitationSchema } from './citation';
import { EntitySchema } from '../extraction/schemas';
import { TextNodeSchema } from '../nodes/text-node';
/**
 * GraphEdge - edge in knowledge graph.
 */
export const GraphEdgeSchema = z.object({
    sourceId: z.string(),
    targetId: z.string(),
    type: z.string(),
    weight: z.number().optional(),
});
/**
 * ProvenanceChain - complete path from query to answer.
 * For transparent, explainable Graph RAG responses.
 */
export const ProvenanceChainSchema = z.object({
    /** Original query */
    query: z.string(),
    /** Retrieved chunks */
    retrievedChunks: z.array(TextNodeSchema),
    /** Extracted entities */
    extractedEntities: z.array(EntitySchema),
    /** Graph traversal path */
    graphPath: z.array(GraphEdgeSchema),
    /** Final citations */
    citations: z.array(CitationSchema),
    /** Timestamps */
    createdAt: z.string().datetime(),
    processingTimeMs: z.number(),
});
