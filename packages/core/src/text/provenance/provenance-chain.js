"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvenanceChainSchema = exports.GraphEdgeSchema = void 0;
const zod_1 = require("zod");
const citation_1 = require("./citation");
const schemas_1 = require("../extraction/schemas");
const text_node_1 = require("../nodes/text-node");
/**
 * GraphEdge - edge in knowledge graph.
 */
exports.GraphEdgeSchema = zod_1.z.object({
    sourceId: zod_1.z.string(),
    targetId: zod_1.z.string(),
    type: zod_1.z.string(),
    weight: zod_1.z.number().optional(),
});
/**
 * ProvenanceChain - complete path from query to answer.
 * For transparent, explainable Graph RAG responses.
 */
exports.ProvenanceChainSchema = zod_1.z.object({
    /** Original query */
    query: zod_1.z.string(),
    /** Retrieved chunks */
    retrievedChunks: zod_1.z.array(text_node_1.TextNodeSchema),
    /** Extracted entities */
    extractedEntities: zod_1.z.array(schemas_1.EntitySchema),
    /** Graph traversal path */
    graphPath: zod_1.z.array(exports.GraphEdgeSchema),
    /** Final citations */
    citations: zod_1.z.array(citation_1.CitationSchema),
    /** Timestamps */
    createdAt: zod_1.z.string().datetime(),
    processingTimeMs: zod_1.z.number(),
});
//# sourceMappingURL=provenance-chain.js.map