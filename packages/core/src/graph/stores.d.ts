/**
 * @gerts/core - Graph Store Interfaces (Interface Segregation Principle)
 *
 * Split IGraphStore (~40 methods) into focused, single-responsibility interfaces.
 * Following ISP: clients should not be forced to depend on interfaces they don't use.
 *
 * This enables:
 * - Independent implementation of sub-interfaces
 * - Better testability with focused mocks
 * - Clearer API contracts for consumers
 * - Easier extension without breaking existing code
 */
/**
 * Entity type enumeration for knowledge graph nodes.
 */
export type GraphEntityType = 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'EVENT' | 'CONCEPT' | 'PRODUCT' | 'DATE' | 'DOCUMENT' | 'CUSTOM';
/**
 * GraphEntity - node in the knowledge graph.
 * Represents extracted named entities with embeddings and rankings.
 */
export interface GraphEntity {
    /** Unique identifier (UUID) */
    id: string;
    /** Canonical entity name (normalized) */
    name: string;
    /** Normalized name for matching (uppercase) */
    normalizedName: string;
    /** Entity type */
    type: GraphEntityType;
    /** Custom type name if type === 'CUSTOM' */
    customType?: string;
    /** Entity description (merged from extractions) */
    description: string;
    /** Semantic embedding of description */
    embedding?: number[];
    /** Name embedding for entity matching */
    nameEmbedding?: number[];
    /** Community IDs this entity belongs to (hierarchical) */
    communityIds: string[];
    /** Text unit IDs where this entity appears */
    textUnitIds: string[];
    /** PageRank score (0-1) for relevance ranking */
    rank: number;
    /** Degree centrality (number of connections) */
    degree: number;
    /** Multi-tenant namespace */
    tenantId: string;
    /** Dynamic properties */
    metadata: Record<string, unknown>;
    /** When entity was created in system */
    createdAt: Date;
    /** When entity was last updated */
    updatedAt: Date;
}
/**
 * Relationship - edge in the knowledge graph.
 * Represents connections between entities with bi-temporal validity.
 */
export interface Relationship {
    /** Unique identifier (UUID) */
    id: string;
    /** Source entity ID */
    sourceId: string;
    /** Target entity ID */
    targetId: string;
    /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') */
    type: string;
    /** Relationship description (fact) */
    description: string;
    /** Semantic embedding of description */
    embedding?: number[];
    /** Edge weight for graph algorithms (1-10) */
    weight: number;
    /** Text unit IDs where this relationship appears */
    textUnitIds: string[];
    /** When the fact became true in real world */
    validAt?: Date;
    /** When the fact stopped being true in real world */
    invalidAt?: Date;
    /** When relationship was recorded in system */
    createdAt: Date;
    /** When relationship was invalidated in system */
    expiredAt?: Date;
    /** Multi-tenant namespace */
    tenantId: string;
    /** Dynamic properties */
    metadata: Record<string, unknown>;
}
/**
 * Community - cluster of related entities.
 * Hierarchical structure for global search.
 */
export interface Community {
    /** Unique identifier (UUID) */
    id: string;
    /** Hierarchy level (0 = most granular) */
    level: number;
    /** Community title (generated from entities) */
    title: string;
    /** Community summary (aggregated from entities) */
    summary: string;
    /** Embedding of summary for search */
    embedding?: number[];
    /** Entity IDs in this community */
    entityIds: string[];
    /** Relationship IDs in this community */
    relationshipIds: string[];
    /** Parent community ID (higher level) */
    parentId?: string;
    /** Children community IDs (lower level) */
    childrenIds: string[];
    /** Number of entities (for ranking) */
    size: number;
    /** Rank score for retrieval */
    rank: number;
    /** Multi-tenant namespace */
    tenantId: string;
    /** When community was created */
    createdAt: Date;
}
/**
 * TextUnit - source chunk for provenance tracking.
 * Links entities and relationships back to original text.
 */
export interface TextUnit {
    /** Unique identifier (hash or UUID) */
    id: string;
    /** Chunk text content */
    text: string;
    /** Token count for this chunk */
    tokenCount: number;
    /** Source document IDs */
    documentIds: string[];
    /** Entity IDs extracted from this chunk */
    entityIds: string[];
    /** Relationship IDs extracted from this chunk */
    relationshipIds: string[];
    /** Semantic embedding */
    embedding?: number[];
    /** Multi-tenant namespace */
    tenantId: string;
    /** Dynamic metadata */
    metadata: Record<string, unknown>;
    /** When chunk was processed */
    createdAt: Date;
}
/**
 * EntityMention - MENTIONS edge linking entity to source chunk.
 * Provides reverse lookup: "What chunks mention this entity?"
 */
export interface EntityMention {
    /** Entity ID */
    entityId: string;
    /** Chunk/TextUnit ID */
    chunkId: string;
    /** Multi-tenant namespace */
    tenantId: string;
    /** Character offset in chunk (optional) */
    offset?: number;
    /** Mention length in characters (optional) */
    length?: number;
    /** Confidence score (0-1) */
    confidence?: number;
    /** Original mention text */
    mentionText?: string;
    /** When mention was recorded */
    createdAt: Date;
    /** Dynamic metadata */
    metadata: Record<string, unknown>;
}
/**
 * Pagination options for mention queries.
 */
export interface MentionQueryOptions {
    /** Maximum items to return */
    limit?: number;
    /** Number of items to skip */
    offset?: number;
    /** Sort order */
    sortBy?: 'createdAt' | 'confidence';
    /** Sort direction */
    sortOrder?: 'asc' | 'desc';
}
/**
 * Graph statistics for monitoring and debugging.
 */
export interface GraphStats {
    /** Number of entities */
    entityCount: number;
    /** Number of relationships */
    relationshipCount: number;
    /** Number of communities */
    communityCount: number;
    /** Number of text units */
    textUnitCount: number;
    /** Number of mentions */
    mentionCount: number;
}
/**
 * IEntityStore - Entity storage operations.
 *
 * Focused interface for entity CRUD operations.
 * Clients that only need entity management can depend on this interface alone.
 */
export interface IEntityStore {
    /**
     * Add a single entity to the store.
     */
    addEntity(entity: GraphEntity): Promise<void>;
    /**
     * Add multiple entities to the store.
     * Implementations should optimize for batch operations.
     */
    addEntities(entities: GraphEntity[]): Promise<void>;
    /**
     * Get an entity by ID.
     * @param id - Entity ID
     * @param tenantId - Optional tenant ID for access control
     * @returns Entity or null if not found (or access denied)
     */
    getEntity(id: string, tenantId?: string): Promise<GraphEntity | null>;
    /**
     * Get entities by their IDs.
     * @param ids - Array of entity IDs
     * @param tenantId - Optional tenant ID for filtering
     */
    getEntities(ids: string[], tenantId?: string): Promise<GraphEntity[]>;
    /**
     * Update an entity's properties.
     * @param id - Entity ID
     * @param updates - Partial entity updates
     * @param tenantId - Tenant ID for access control
     */
    updateEntity(id: string, updates: Partial<GraphEntity>, tenantId: string): Promise<void>;
    /**
     * Delete an entity.
     * @param id - Entity ID
     * @param tenantId - Tenant ID for access control
     * @returns true if deleted, false if not found
     */
    deleteEntity(id: string, tenantId: string): Promise<boolean>;
}
/**
 * IRelationshipStore - Relationship storage operations.
 *
 * Focused interface for relationship (edge) CRUD operations.
 */
export interface IRelationshipStore {
    /**
     * Add a relationship between two entities.
     */
    addRelationship(relationship: Relationship): Promise<void>;
    /**
     * Add multiple relationships.
     * Implementations should optimize for batch operations.
     */
    addRelationships(relationships: Relationship[]): Promise<void>;
    /**
     * Get a relationship by ID.
     * @param id - Relationship ID
     * @param tenantId - Optional tenant ID for access control
     */
    getRelationship(id: string, tenantId?: string): Promise<Relationship | null>;
    /**
     * Get relationships by their IDs.
     * @param ids - Array of relationship IDs
     * @param tenantId - Optional tenant ID for filtering
     */
    getRelationships(ids: string[], tenantId?: string): Promise<Relationship[]>;
    /**
     * Get all relationships connected to an entity.
     * @param entityId - Entity ID (as source or target)
     * @param tenantId - Tenant ID for access control
     */
    getRelationshipsByEntity(entityId: string, tenantId: string): Promise<Relationship[]>;
}
/**
 * IMentionStore - Mention/provenance storage operations.
 *
 * Focused interface for entity-chunk provenance tracking.
 * Essential for citation generation and source attribution.
 */
export interface IMentionStore {
    /**
     * Add a MENTIONS edge from entity to chunk.
     */
    addEntityMention(mention: EntityMention): Promise<void>;
    /**
     * Add multiple MENTIONS edges.
     */
    addEntityMentions(mentions: EntityMention[]): Promise<void>;
    /**
     * Get all chunks that mention an entity.
     * @param entityId - Entity ID
     * @param tenantId - Tenant ID for access control
     * @param options - Pagination and sorting options
     */
    getChunksByEntity(entityId: string, tenantId: string, options?: MentionQueryOptions): Promise<TextUnit[]>;
    /**
     * Get all mentions for an entity.
     * @param entityId - Entity ID
     * @param tenantId - Tenant ID for access control
     * @param options - Pagination and sorting options
     */
    getEntityMentions(entityId: string, tenantId: string, options?: MentionQueryOptions): Promise<EntityMention[]>;
    /**
     * Count mentions for an entity.
     * @param entityId - Entity ID
     * @param tenantId - Tenant ID for access control
     */
    countEntityMentions(entityId: string, tenantId: string): Promise<number>;
}
/**
 * ITextUnitStore - Text unit (chunk) storage operations.
 *
 * Focused interface for chunk CRUD operations.
 */
export interface ITextUnitStore {
    /**
     * Add a text unit to the store.
     */
    addTextUnit(textUnit: TextUnit): Promise<void>;
    /**
     * Add multiple text units.
     */
    addTextUnits(textUnits: TextUnit[]): Promise<void>;
    /**
     * Get a text unit by ID.
     * @param id - Text unit ID
     * @param tenantId - Optional tenant ID for access control
     */
    getTextUnit(id: string, tenantId?: string): Promise<TextUnit | null>;
    /**
     * Get text units by their IDs.
     * @param ids - Array of text unit IDs
     * @param tenantId - Optional tenant ID for filtering
     */
    getTextUnits(ids: string[], tenantId?: string): Promise<TextUnit[]>;
}
/**
 * ICommunityStore - Community storage operations.
 *
 * Focused interface for community (cluster) CRUD operations.
 */
export interface ICommunityStore {
    /**
     * Add a community to the store.
     */
    addCommunity(community: Community): Promise<void>;
    /**
     * Get communities for a tenant.
     * @param tenantId - Tenant ID
     */
    getCommunities(tenantId: string): Promise<Community[]>;
    /**
     * Get a community by ID.
     * @param id - Community ID
     * @param tenantId - Optional tenant ID for access control
     */
    getCommunity(id: string, tenantId?: string): Promise<Community | null>;
}
/**
 * IGraphStore - Composed graph store interface.
 *
 * Combines all segregated interfaces into a complete graph store contract.
 * Implementations that provide full graph storage capabilities should
 * implement this interface.
 *
 * For partial implementations, clients should depend on specific sub-interfaces
 * (e.g., IEntityStore for entity-only operations).
 */
export interface IGraphStore extends IEntityStore, IRelationshipStore, IMentionStore, ITextUnitStore, ICommunityStore {
    /**
     * Clear all data for a tenant.
     * @param tenantId - Tenant ID
     */
    clear(tenantId: string): Promise<void>;
    /**
     * Get statistics for a tenant's graph.
     * @param tenantId - Tenant ID
     */
    getStats(tenantId: string): Promise<GraphStats>;
}
/**
 * Check if an object implements IEntityStore.
 */
export declare function isEntityStore(obj: unknown): obj is IEntityStore;
/**
 * Check if an object implements IRelationshipStore.
 */
export declare function isRelationshipStore(obj: unknown): obj is IRelationshipStore;
/**
 * Check if an object implements IMentionStore.
 */
export declare function isMentionStore(obj: unknown): obj is IMentionStore;
/**
 * Check if an object implements ITextUnitStore.
 */
export declare function isTextUnitStore(obj: unknown): obj is ITextUnitStore;
/**
 * Check if an object implements ICommunityStore.
 */
export declare function isCommunityStore(obj: unknown): obj is ICommunityStore;
/**
 * Check if an object implements full IGraphStore.
 */
export declare function isGraphStore(obj: unknown): obj is IGraphStore;
//# sourceMappingURL=stores.d.ts.map