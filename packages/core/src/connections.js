"use strict";
/**
 * @gerts/core - Connection Types
 *
 * 24 typed connections for AI/Graph RAG components.
 * Based on n8n's NodeConnectionTypes + Graph RAG specific types.
 *
 * @see research/architecture/13-execution-engine-spec.md Section 6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONNECTION_COMPATIBILITY = exports.GertsConnectionTypes = void 0;
exports.validateConnection = validateConnection;
exports.isAiConnectionType = isAiConnectionType;
exports.isGraphConnectionType = isGraphConnectionType;
exports.getAcceptedConnectionTypes = getAcceptedConnectionTypes;
exports.getCompatibleTargets = getCompatibleTargets;
/**
 * All connection types supported by gerts.ai
 */
exports.GertsConnectionTypes = {
    // === Standard Flow ===
    Main: 'main',
    Error: 'error',
    // === AI Components (from n8n) ===
    AiAgent: 'ai_agent',
    AiChain: 'ai_chain',
    AiLanguageModel: 'ai_languageModel',
    AiMemory: 'ai_memory',
    AiTool: 'ai_tool',
    AiOutputParser: 'ai_outputParser',
    AiEmbedding: 'ai_embedding',
    AiVectorStore: 'ai_vectorStore',
    AiRetriever: 'ai_retriever',
    AiReranker: 'ai_reranker',
    AiDocument: 'ai_document',
    AiTextSplitter: 'ai_textSplitter',
    // === Graph RAG Specific ===
    GraphStore: 'graph_store',
    EntityExtractor: 'entity_extractor',
    RelationExtractor: 'relation_extractor',
    Triplets: 'triplets',
    GraphSubgraph: 'graph_subgraph',
    GraphPaths: 'graph_paths',
    GraphCommunities: 'graph_communities',
    KnowledgeMemory: 'knowledge_memory',
    ConversationMemory: 'conversation_memory',
    RankedResults: 'ranked_results',
    RetrievalContext: 'retrieval_context',
    // === Document Processing ===
    DocumentChunks: 'document_chunks',
    Embeddings: 'embeddings',
    VectorResults: 'vector_results',
};
/**
 * Connection compatibility matrix.
 * Maps target connection types to acceptable source types.
 */
exports.CONNECTION_COMPATIBILITY = {
    // Main accepts any
    [exports.GertsConnectionTypes.Main]: [],
    [exports.GertsConnectionTypes.Error]: [],
    // Agent can receive: model, memory, tools, retriever
    [exports.GertsConnectionTypes.AiAgent]: [
        exports.GertsConnectionTypes.AiLanguageModel,
        exports.GertsConnectionTypes.AiMemory,
        exports.GertsConnectionTypes.AiTool,
        exports.GertsConnectionTypes.AiRetriever,
    ],
    // Chain can receive: model, memory, output parser
    [exports.GertsConnectionTypes.AiChain]: [
        exports.GertsConnectionTypes.AiLanguageModel,
        exports.GertsConnectionTypes.AiMemory,
        exports.GertsConnectionTypes.AiOutputParser,
    ],
    // Language model - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiLanguageModel]: [],
    // Memory - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiMemory]: [],
    // Tool - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiTool]: [],
    // Output parser - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiOutputParser]: [],
    // Embedding - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiEmbedding]: [],
    // Vector store can receive: embedding
    [exports.GertsConnectionTypes.AiVectorStore]: [
        exports.GertsConnectionTypes.AiEmbedding,
    ],
    // Retriever can receive: vector store, graph store, reranker
    [exports.GertsConnectionTypes.AiRetriever]: [
        exports.GertsConnectionTypes.AiVectorStore,
        exports.GertsConnectionTypes.GraphStore,
        exports.GertsConnectionTypes.AiReranker,
    ],
    // Reranker - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiReranker]: [],
    // Document - no inputs (leaf node)
    [exports.GertsConnectionTypes.AiDocument]: [],
    // Text splitter can receive: document
    [exports.GertsConnectionTypes.AiTextSplitter]: [
        exports.GertsConnectionTypes.AiDocument,
    ],
    // Graph store can receive: entity extractor, relation extractor, triplets
    [exports.GertsConnectionTypes.GraphStore]: [
        exports.GertsConnectionTypes.EntityExtractor,
        exports.GertsConnectionTypes.RelationExtractor,
        exports.GertsConnectionTypes.Triplets,
    ],
    // Entity extractor can receive: language model
    [exports.GertsConnectionTypes.EntityExtractor]: [
        exports.GertsConnectionTypes.AiLanguageModel,
    ],
    // Relation extractor can receive: language model
    [exports.GertsConnectionTypes.RelationExtractor]: [
        exports.GertsConnectionTypes.AiLanguageModel,
    ],
    // Triplets - no inputs (leaf node)
    [exports.GertsConnectionTypes.Triplets]: [],
    // Graph subgraph - no inputs (result type)
    [exports.GertsConnectionTypes.GraphSubgraph]: [],
    // Graph paths - no inputs (result type)
    [exports.GertsConnectionTypes.GraphPaths]: [],
    // Graph communities - no inputs (result type)
    [exports.GertsConnectionTypes.GraphCommunities]: [],
    // Knowledge memory can receive: graph store, vector store
    [exports.GertsConnectionTypes.KnowledgeMemory]: [
        exports.GertsConnectionTypes.GraphStore,
        exports.GertsConnectionTypes.AiVectorStore,
    ],
    // Conversation memory - no inputs (leaf node)
    [exports.GertsConnectionTypes.ConversationMemory]: [],
    // Ranked results - no inputs (result type)
    [exports.GertsConnectionTypes.RankedResults]: [],
    // Retrieval context - no inputs (result type)
    [exports.GertsConnectionTypes.RetrievalContext]: [],
    // Document chunks can receive: text splitter
    [exports.GertsConnectionTypes.DocumentChunks]: [
        exports.GertsConnectionTypes.AiTextSplitter,
    ],
    // Embeddings can receive: embedding provider
    [exports.GertsConnectionTypes.Embeddings]: [
        exports.GertsConnectionTypes.AiEmbedding,
    ],
    // Vector results - no inputs (result type)
    [exports.GertsConnectionTypes.VectorResults]: [],
};
/**
 * Validate if a connection between source and target is valid.
 *
 * @param sourceType - The output type of the source node
 * @param targetType - The input type the target node expects
 * @returns Validation result with reason if invalid
 *
 * @example
 * ```typescript
 * const result = validateConnection(
 *   GertsConnectionTypes.AiLanguageModel,
 *   GertsConnectionTypes.AiAgent
 * );
 * // { valid: true }
 * ```
 */
function validateConnection(sourceType, targetType) {
    // Main connections always valid
    if (sourceType === exports.GertsConnectionTypes.Main || targetType === exports.GertsConnectionTypes.Main) {
        return { valid: true };
    }
    // Error connections always valid
    if (sourceType === exports.GertsConnectionTypes.Error || targetType === exports.GertsConnectionTypes.Error) {
        return { valid: true };
    }
    // Check compatibility matrix
    const acceptedTypes = exports.CONNECTION_COMPATIBILITY[targetType];
    // If target has no accepted types defined, it's a leaf node (no inputs)
    if (acceptedTypes.length === 0) {
        return {
            valid: false,
            reason: `Connection type '${targetType}' does not accept any inputs`,
        };
    }
    // Check if source type is in accepted list
    if (acceptedTypes.includes(sourceType)) {
        return { valid: true };
    }
    return {
        valid: false,
        reason: `Connection type '${targetType}' does not accept '${sourceType}'. Accepted types: ${acceptedTypes.join(', ')}`,
    };
}
/**
 * Check if a connection type is an AI component type
 */
function isAiConnectionType(type) {
    return type.startsWith('ai_');
}
/**
 * Check if a connection type is a Graph RAG specific type
 */
function isGraphConnectionType(type) {
    return (type.startsWith('graph_') ||
        type === exports.GertsConnectionTypes.EntityExtractor ||
        type === exports.GertsConnectionTypes.RelationExtractor ||
        type === exports.GertsConnectionTypes.Triplets ||
        type === exports.GertsConnectionTypes.KnowledgeMemory);
}
/**
 * Get all connection types that a target type accepts
 */
function getAcceptedConnectionTypes(targetType) {
    return exports.CONNECTION_COMPATIBILITY[targetType] ?? [];
}
/**
 * Get all connection types that can connect to a given source type
 */
function getCompatibleTargets(sourceType) {
    const compatibleTargets = [];
    for (const [target, accepted] of Object.entries(exports.CONNECTION_COMPATIBILITY)) {
        if (accepted.includes(sourceType)) {
            compatibleTargets.push(target);
        }
    }
    return compatibleTargets;
}
//# sourceMappingURL=connections.js.map