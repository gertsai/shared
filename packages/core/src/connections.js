/**
 * @gerts/core - Connection Types
 *
 * 24 typed connections for AI/Graph RAG components.
 * Based on n8n's NodeConnectionTypes + Graph RAG specific types.
 *
 * @see research/architecture/13-execution-engine-spec.md Section 6
 */
/**
 * All connection types supported by gerts.ai
 */
export const GertsConnectionTypes = {
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
export const CONNECTION_COMPATIBILITY = {
    // Main accepts any
    [GertsConnectionTypes.Main]: [],
    [GertsConnectionTypes.Error]: [],
    // Agent can receive: model, memory, tools, retriever
    [GertsConnectionTypes.AiAgent]: [
        GertsConnectionTypes.AiLanguageModel,
        GertsConnectionTypes.AiMemory,
        GertsConnectionTypes.AiTool,
        GertsConnectionTypes.AiRetriever,
    ],
    // Chain can receive: model, memory, output parser
    [GertsConnectionTypes.AiChain]: [
        GertsConnectionTypes.AiLanguageModel,
        GertsConnectionTypes.AiMemory,
        GertsConnectionTypes.AiOutputParser,
    ],
    // Language model - no inputs (leaf node)
    [GertsConnectionTypes.AiLanguageModel]: [],
    // Memory - no inputs (leaf node)
    [GertsConnectionTypes.AiMemory]: [],
    // Tool - no inputs (leaf node)
    [GertsConnectionTypes.AiTool]: [],
    // Output parser - no inputs (leaf node)
    [GertsConnectionTypes.AiOutputParser]: [],
    // Embedding - no inputs (leaf node)
    [GertsConnectionTypes.AiEmbedding]: [],
    // Vector store can receive: embedding
    [GertsConnectionTypes.AiVectorStore]: [
        GertsConnectionTypes.AiEmbedding,
    ],
    // Retriever can receive: vector store, graph store, reranker
    [GertsConnectionTypes.AiRetriever]: [
        GertsConnectionTypes.AiVectorStore,
        GertsConnectionTypes.GraphStore,
        GertsConnectionTypes.AiReranker,
    ],
    // Reranker - no inputs (leaf node)
    [GertsConnectionTypes.AiReranker]: [],
    // Document - no inputs (leaf node)
    [GertsConnectionTypes.AiDocument]: [],
    // Text splitter can receive: document
    [GertsConnectionTypes.AiTextSplitter]: [
        GertsConnectionTypes.AiDocument,
    ],
    // Graph store can receive: entity extractor, relation extractor, triplets
    [GertsConnectionTypes.GraphStore]: [
        GertsConnectionTypes.EntityExtractor,
        GertsConnectionTypes.RelationExtractor,
        GertsConnectionTypes.Triplets,
    ],
    // Entity extractor can receive: language model
    [GertsConnectionTypes.EntityExtractor]: [
        GertsConnectionTypes.AiLanguageModel,
    ],
    // Relation extractor can receive: language model
    [GertsConnectionTypes.RelationExtractor]: [
        GertsConnectionTypes.AiLanguageModel,
    ],
    // Triplets - no inputs (leaf node)
    [GertsConnectionTypes.Triplets]: [],
    // Graph subgraph - no inputs (result type)
    [GertsConnectionTypes.GraphSubgraph]: [],
    // Graph paths - no inputs (result type)
    [GertsConnectionTypes.GraphPaths]: [],
    // Graph communities - no inputs (result type)
    [GertsConnectionTypes.GraphCommunities]: [],
    // Knowledge memory can receive: graph store, vector store
    [GertsConnectionTypes.KnowledgeMemory]: [
        GertsConnectionTypes.GraphStore,
        GertsConnectionTypes.AiVectorStore,
    ],
    // Conversation memory - no inputs (leaf node)
    [GertsConnectionTypes.ConversationMemory]: [],
    // Ranked results - no inputs (result type)
    [GertsConnectionTypes.RankedResults]: [],
    // Retrieval context - no inputs (result type)
    [GertsConnectionTypes.RetrievalContext]: [],
    // Document chunks can receive: text splitter
    [GertsConnectionTypes.DocumentChunks]: [
        GertsConnectionTypes.AiTextSplitter,
    ],
    // Embeddings can receive: embedding provider
    [GertsConnectionTypes.Embeddings]: [
        GertsConnectionTypes.AiEmbedding,
    ],
    // Vector results - no inputs (result type)
    [GertsConnectionTypes.VectorResults]: [],
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
export function validateConnection(sourceType, targetType) {
    // Main connections always valid
    if (sourceType === GertsConnectionTypes.Main || targetType === GertsConnectionTypes.Main) {
        return { valid: true };
    }
    // Error connections always valid
    if (sourceType === GertsConnectionTypes.Error || targetType === GertsConnectionTypes.Error) {
        return { valid: true };
    }
    // Check compatibility matrix
    const acceptedTypes = CONNECTION_COMPATIBILITY[targetType];
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
export function isAiConnectionType(type) {
    return type.startsWith('ai_');
}
/**
 * Check if a connection type is a Graph RAG specific type
 */
export function isGraphConnectionType(type) {
    return (type.startsWith('graph_') ||
        type === GertsConnectionTypes.EntityExtractor ||
        type === GertsConnectionTypes.RelationExtractor ||
        type === GertsConnectionTypes.Triplets ||
        type === GertsConnectionTypes.KnowledgeMemory);
}
/**
 * Get all connection types that a target type accepts
 */
export function getAcceptedConnectionTypes(targetType) {
    return CONNECTION_COMPATIBILITY[targetType] ?? [];
}
/**
 * Get all connection types that can connect to a given source type
 */
export function getCompatibleTargets(sourceType) {
    const compatibleTargets = [];
    for (const [target, accepted] of Object.entries(CONNECTION_COMPATIBILITY)) {
        if (accepted.includes(sourceType)) {
            compatibleTargets.push(target);
        }
    }
    return compatibleTargets;
}
