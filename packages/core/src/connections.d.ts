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
export declare const GertsConnectionTypes: {
    readonly Main: "main";
    readonly Error: "error";
    readonly AiAgent: "ai_agent";
    readonly AiChain: "ai_chain";
    readonly AiLanguageModel: "ai_languageModel";
    readonly AiMemory: "ai_memory";
    readonly AiTool: "ai_tool";
    readonly AiOutputParser: "ai_outputParser";
    readonly AiEmbedding: "ai_embedding";
    readonly AiVectorStore: "ai_vectorStore";
    readonly AiRetriever: "ai_retriever";
    readonly AiReranker: "ai_reranker";
    readonly AiDocument: "ai_document";
    readonly AiTextSplitter: "ai_textSplitter";
    readonly GraphStore: "graph_store";
    readonly EntityExtractor: "entity_extractor";
    readonly RelationExtractor: "relation_extractor";
    readonly Triplets: "triplets";
    readonly GraphSubgraph: "graph_subgraph";
    readonly GraphPaths: "graph_paths";
    readonly GraphCommunities: "graph_communities";
    readonly KnowledgeMemory: "knowledge_memory";
    readonly ConversationMemory: "conversation_memory";
    readonly RankedResults: "ranked_results";
    readonly RetrievalContext: "retrieval_context";
    readonly DocumentChunks: "document_chunks";
    readonly Embeddings: "embeddings";
    readonly VectorResults: "vector_results";
};
/**
 * Union type of all connection type values
 */
export type GertsConnectionType = typeof GertsConnectionTypes[keyof typeof GertsConnectionTypes];
/**
 * Connection compatibility matrix.
 * Maps target connection types to acceptable source types.
 */
export declare const CONNECTION_COMPATIBILITY: Record<GertsConnectionType, readonly GertsConnectionType[]>;
/**
 * Validation result for connection check
 */
export interface ConnectionValidationResult {
    valid: boolean;
    reason?: string;
}
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
export declare function validateConnection(sourceType: GertsConnectionType, targetType: GertsConnectionType): ConnectionValidationResult;
/**
 * Check if a connection type is an AI component type
 */
export declare function isAiConnectionType(type: GertsConnectionType): boolean;
/**
 * Check if a connection type is a Graph RAG specific type
 */
export declare function isGraphConnectionType(type: GertsConnectionType): boolean;
/**
 * Get all connection types that a target type accepts
 */
export declare function getAcceptedConnectionTypes(targetType: GertsConnectionType): readonly GertsConnectionType[];
/**
 * Get all connection types that can connect to a given source type
 */
export declare function getCompatibleTargets(sourceType: GertsConnectionType): GertsConnectionType[];
//# sourceMappingURL=connections.d.ts.map