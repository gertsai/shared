/**
 * TenantConfig types for GraphRAG Pipeline
 *
 * Two-layer configuration architecture:
 * - TenantConfig (persistent) - stored in PostgreSQL, cached in Redis
 * - SessionContext (request-scoped) - per-request, in-memory
 *
 * Uses Typia for compile-time validation (20,000x faster than Zod)
 *
 * @example
 * ```typescript
 * const validation = validateTenantConfig(config);
 * if (validation.success) {
 *   const config = validation.data;
 * }
 * ```
 */

// ============================================================================
// LLM Configuration
// ============================================================================

/**
 * Supported LLM providers for tenant config
 * Note: Prefixed with "Tenant" to avoid collision with @gerts/core/llm
 */
export type TenantLLMProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'litellm'
  | 'custom';

/**
 * LLM configuration for the tenant
 * Note: Prefixed with "Tenant" to avoid collision with @gerts/core/llm
 */
export interface TenantLLMConfig {
  /** LLM provider */
  provider: TenantLLMProvider;
  /** Model identifier (e.g., 'gpt-4', 'claude-sonnet-4-20250514') */
  model: string;
  /**
   * API key reference (stored in Vault, not plain text!)
   * Format: vault://secrets/tenants/{tenantId}/llm-api-key
   */
  apiKeyRef?: string;
  /** Base URL for custom/proxy providers */
  baseUrl?: string;
  /** Temperature for generation @default 0.7 */
  temperature?: number;
  /** Max tokens for generation @default 4096 */
  maxTokens?: number;
  /** Timeout in ms @default 60000 */
  timeout?: number;
}

// ============================================================================
// Embedding Configuration
// ============================================================================

/**
 * Supported embedding providers
 */
export type EmbeddingProvider = 'openai' | 'azure' | 'infinity' | 'ollama' | 'custom';

/**
 * Embedding configuration for the tenant
 */
export interface EmbeddingConfig {
  /** Embedding provider */
  provider: EmbeddingProvider;
  /** Model identifier (e.g., 'text-embedding-3-small') */
  model: string;
  /** API key reference (Vault) */
  apiKeyRef?: string;
  /** Base URL for custom providers */
  baseUrl?: string;
  /** Embedding dimension @default 1536 */
  dimension?: number;
  /** Batch size for embedding @default 100 */
  batchSize?: number;
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Prompt template configuration
 * Supports {{variable}} placeholders
 */
export interface PromptConfig {
  /** Entity extraction prompt */
  entityExtraction?: string;
  /** Relationship extraction prompt */
  relationshipExtraction?: string;
  /** Community summary prompt (level-based) */
  communitySummary?: string | Record<number, string>;
  /** Answer generation prompt */
  answerGeneration?: string;
  /** Question analysis prompt */
  questionAnalysis?: string;
  /** Global search map prompt */
  globalSearchMap?: string;
  /** Global search reduce prompt */
  globalSearchReduce?: string;
}

// ============================================================================
// Ontology Binding
// ============================================================================

/**
 * Ontology binding for composition
 *
 * Three-level hierarchy:
 * 1. Standard ontologies (Schema.org, FOAF, Dublin Core)
 * 2. Domain ontologies (legal, healthcare, manufacturing)
 * 3. Custom ontologies (tenant-specific extensions)
 */
export interface OntologyBinding {
  /** Ontology UUID */
  ontologyId: string;
  /** Ontology URI (e.g., 'gerts.ai/legal', 'schema.org') */
  uri: string;
  /** Semantic version (e.g., '2.1.0') */
  version: string;
  /** Priority for composition (higher = overrides) */
  priority: number;
  /** Binding configuration */
  config?: {
    /** Automatically resolve ontology dependencies */
    autoResolveDeps?: boolean;
    /** Classes to override from lower priority ontologies */
    overrideClasses?: string[];
    /** Properties to override from lower priority ontologies */
    overrideProperties?: string[];
  };
}

// ============================================================================
// GraphRAG Settings
// ============================================================================

/**
 * Search mode for GraphRAG queries
 */
export type GraphRAGMode = 'local' | 'global' | 'hybrid' | 'auto';

/**
 * GraphRAG configuration for the tenant
 */
export interface GraphRAGConfig {
  /** Default search mode @default 'auto' */
  mode?: GraphRAGMode;
  /** Max hops for local search @default 2 */
  maxHops?: number;
  /** Number of results @default 20 */
  topK?: number;
  /** Use schema hints for extraction @default true */
  useSchemaHints?: boolean;
  /** Enable ontology mode @default false */
  ontologyMode?: boolean;
  /** Community hierarchy level @default 0 */
  communityLevel?: number;
  /** Include communities in results @default true */
  includeCommunities?: boolean;
  /** Include entities in results @default true */
  includeEntities?: boolean;
  /** Include relationships in results @default true */
  includeRelationships?: boolean;
  /** Include source chunks in results @default true */
  includeSources?: boolean;
  /** Max tokens for response @default 4096 */
  maxTokens?: number;
  /** Enable streaming @default false */
  streaming?: boolean;
  /** Chunk size for streaming @default 100 */
  streamChunkSize?: number;
  /** Entity types to extract (from ontology) */
  entityTypes?: string[];
  /** Relationship types to extract (from ontology) */
  relationshipTypes?: string[];
}

// ============================================================================
// Locale Settings
// ============================================================================

/**
 * Locale configuration for the tenant
 */
export interface LocaleConfig {
  /** Language code (ISO 639-1) @default 'en' */
  language?: string;
  /** Timezone (IANA) @default 'UTC' */
  timezone?: string;
  /** Date format @default 'YYYY-MM-DD' */
  dateFormat?: string;
  /** Number format locale @default 'en-US' */
  numberFormat?: string;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Requests per minute @default 60 */
  requestsPerMinute?: number;
  /** Requests per hour @default 1000 */
  requestsPerHour?: number;
  /** Requests per day @default 10000 */
  requestsPerDay?: number;
  /** Max concurrent requests @default 10 */
  maxConcurrent?: number;
  /** Token limit per minute (for LLM) @default 100000 */
  tokensPerMinute?: number;
}

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Feature flags for the tenant
 */
export interface FeatureFlags {
  /** Enable community detection @default true */
  communityDetection?: boolean;
  /** Enable entity deduplication @default true */
  entityDeduplication?: boolean;
  /** Enable ontology RAG @default false */
  ontologyRag?: boolean;
  /** Enable SHACL validation @default false */
  shaclValidation?: boolean;
  /** SHACL mode: 'warning' logs only, 'strict' blocks @default 'warning' */
  shaclMode?: 'warning' | 'strict';
  /** Enable numeric property extraction @default true */
  numericProperties?: boolean;
  /** Enable audit logging @default true */
  auditLogging?: boolean;
  /** Enable real-time events (WebSocket) @default false */
  realTimeEvents?: boolean;
}

// ============================================================================
// Ingestion Settings
// ============================================================================

/**
 * Ingestion configuration for the tenant
 */
export interface IngestionConfig {
  /** Chunk size in characters @default 1000 */
  chunkSize?: number;
  /** Chunk overlap in characters @default 200 */
  chunkOverlap?: number;
  /** Supported file types */
  supportedFileTypes?: string[];
  /** Max file size in bytes @default 50MB */
  maxFileSize?: number;
  /** Max files per batch @default 100 */
  maxFilesPerBatch?: number;
  /** Enable OCR for images/PDFs @default false */
  enableOcr?: boolean;
  /** Enable table extraction @default true */
  enableTableExtraction?: boolean;
}

// ============================================================================
// Community Hierarchy
// ============================================================================

/**
 * Community hierarchy level description
 */
export interface CommunityLevel {
  /** Level index (0 = most detailed) */
  level: number;
  /** Level name (e.g., 'topics', 'themes', 'domains') */
  name: string;
  /** Level description */
  description?: string;
  /** Expected number of communities */
  expectedCount?: number;
}

// ============================================================================
// Main TenantConfig
// ============================================================================

/**
 * Complete tenant configuration
 *
 * Persistent layer stored in PostgreSQL + cached in Redis
 */
export interface TenantConfig {
  /** Unique tenant identifier */
  tenantId: string;

  /** Display name for the tenant */
  name?: string;

  /** Tenant description */
  description?: string;

  /** LLM configuration */
  llm: TenantLLMConfig;

  /** Embedding configuration */
  embedding: EmbeddingConfig;

  /** Prompt templates */
  prompts?: PromptConfig;

  /** Ontology bindings (multiple, priority-based) */
  ontologyBindings?: OntologyBinding[];

  /** GraphRAG settings */
  graphRag?: GraphRAGConfig;

  /** Locale settings */
  locale?: LocaleConfig;

  /** Rate limits */
  rateLimits?: RateLimitConfig;

  /** Feature flags */
  features?: FeatureFlags;

  /** Ingestion settings */
  ingestion?: IngestionConfig;

  /** Community hierarchy description */
  communityHierarchy?: CommunityLevel[];

  /** Config hash for cache invalidation */
  configHash?: string;

  /** Creation timestamp */
  createdAt?: string;

  /** Last update timestamp */
  updatedAt?: string;

  /** Custom metadata (extensible) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Create/Update DTOs
// ============================================================================

/**
 * DTO for creating a new tenant config
 */
export interface TenantConfigCreate {
  /** Unique tenant identifier */
  tenantId: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** LLM configuration (required) */
  llm: TenantLLMConfig;
  /** Embedding configuration (required) */
  embedding: EmbeddingConfig;
  /** Optional: Prompt templates */
  prompts?: PromptConfig;
  /** Optional: Ontology bindings */
  ontologyBindings?: OntologyBinding[];
  /** Optional: GraphRAG settings */
  graphRag?: GraphRAGConfig;
  /** Optional: Locale settings */
  locale?: LocaleConfig;
  /** Optional: Rate limits */
  rateLimits?: RateLimitConfig;
  /** Optional: Feature flags */
  features?: FeatureFlags;
  /** Optional: Ingestion settings */
  ingestion?: IngestionConfig;
  /** Optional: Community hierarchy */
  communityHierarchy?: CommunityLevel[];
  /** Optional: Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a tenant config (all fields optional except tenantId)
 */
export interface TenantConfigUpdate {
  /** Tenant identifier (required for lookup) */
  tenantId: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** LLM configuration */
  llm?: Partial<TenantLLMConfig>;
  /** Embedding configuration */
  embedding?: Partial<EmbeddingConfig>;
  /** Prompt templates */
  prompts?: Partial<PromptConfig>;
  /** Ontology bindings (replace all) */
  ontologyBindings?: OntologyBinding[];
  /** GraphRAG settings */
  graphRag?: Partial<GraphRAGConfig>;
  /** Locale settings */
  locale?: Partial<LocaleConfig>;
  /** Rate limits */
  rateLimits?: Partial<RateLimitConfig>;
  /** Feature flags */
  features?: Partial<FeatureFlags>;
  /** Ingestion settings */
  ingestion?: Partial<IngestionConfig>;
  /** Community hierarchy (replace all) */
  communityHierarchy?: CommunityLevel[];
  /** Custom metadata (merge) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Resolved Config (after composition)
// ============================================================================

/**
 * Resolved configuration after applying:
 * 1. System defaults
 * 2. Tenant config
 * 3. User preferences (if any)
 * 4. Request overrides
 */
export interface ResolvedTenantConfig {
  /** Source tenant config */
  tenantId: string;
  /** LLM configuration (resolved) */
  llm: Required<TenantLLMConfig>;
  /** Embedding configuration (resolved) */
  embedding: Required<EmbeddingConfig>;
  /** Prompt templates (resolved with defaults) */
  prompts: Required<PromptConfig>;
  /** Composed ontology (from bindings) */
  ontology: {
    classes: string[];
    objectProperties: string[];
    datatypeProperties: string[];
  };
  /** GraphRAG settings (resolved) */
  graphRag: Required<GraphRAGConfig>;
  /** Locale settings (resolved) */
  locale: Required<LocaleConfig>;
  /** Rate limits (resolved) */
  rateLimits: Required<RateLimitConfig>;
  /** Feature flags (resolved) */
  features: Required<FeatureFlags>;
  /** Ingestion settings (resolved) */
  ingestion: Required<IngestionConfig>;
  /** Resolution timestamp */
  resolvedAt: string;
}

// ============================================================================
// Runtime Type Guards (manual implementation)
// Note: Typia validators will be used in apps/pipeline where ts-patch is configured
// ============================================================================

/**
 * Check if value is a valid TenantLLMConfig
 */
export function isTenantLLMConfig(value: unknown): value is TenantLLMConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === 'string' &&
    ['openai', 'anthropic', 'azure', 'google', 'ollama', 'litellm', 'custom'].includes(
      v.provider,
    ) &&
    typeof v.model === 'string'
  );
}

/**
 * Check if value is a valid EmbeddingConfig
 */
export function isEmbeddingConfig(value: unknown): value is EmbeddingConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === 'string' &&
    ['openai', 'azure', 'infinity', 'ollama', 'custom'].includes(v.provider) &&
    typeof v.model === 'string'
  );
}

/**
 * Check if value is a valid TenantConfig (basic check)
 */
export function isTenantConfig(value: unknown): value is TenantConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tenantId === 'string' && isTenantLLMConfig(v.llm) && isEmbeddingConfig(v.embedding)
  );
}

/**
 * Check if value is a valid TenantConfigCreate
 */
export function isTenantConfigCreate(value: unknown): value is TenantConfigCreate {
  return isTenantConfig(value);
}

/**
 * Check if value is a valid TenantConfigUpdate
 */
export function isTenantConfigUpdate(value: unknown): value is TenantConfigUpdate {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.tenantId === 'string';
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * System defaults for TenantConfig
 * Used when tenant config is missing or incomplete
 */
export const DEFAULT_TENANT_CONFIG: Omit<TenantConfig, 'tenantId' | 'llm' | 'embedding'> = {
  graphRag: {
    mode: 'auto',
    maxHops: 2,
    topK: 20,
    useSchemaHints: true,
    ontologyMode: false,
    communityLevel: 0,
    includeCommunities: true,
    includeEntities: true,
    includeRelationships: true,
    includeSources: true,
    maxTokens: 4096,
    streaming: false,
    streamChunkSize: 100,
  },
  locale: {
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: 'en-US',
  },
  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    maxConcurrent: 10,
    tokensPerMinute: 100000,
  },
  features: {
    communityDetection: true,
    entityDeduplication: true,
    ontologyRag: false,
    shaclValidation: false,
    shaclMode: 'warning',
    numericProperties: true,
    auditLogging: true,
    realTimeEvents: false,
  },
  ingestion: {
    chunkSize: 1000,
    chunkOverlap: 200,
    supportedFileTypes: ['txt', 'md', 'pdf', 'docx', 'html'],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFilesPerBatch: 100,
    enableOcr: false,
    enableTableExtraction: true,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Merge tenant config with defaults
 *
 * @param config - Partial tenant config
 * @returns Complete tenant config with defaults applied
 */
export function mergeTenantConfigWithDefaults(config: TenantConfigCreate): TenantConfig {
  return {
    ...config,
    graphRag: {
      ...DEFAULT_TENANT_CONFIG.graphRag,
      ...config.graphRag,
    },
    locale: {
      ...DEFAULT_TENANT_CONFIG.locale,
      ...config.locale,
    },
    rateLimits: {
      ...DEFAULT_TENANT_CONFIG.rateLimits,
      ...config.rateLimits,
    },
    features: {
      ...DEFAULT_TENANT_CONFIG.features,
      ...config.features,
    },
    ingestion: {
      ...DEFAULT_TENANT_CONFIG.ingestion,
      ...config.ingestion,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply update to existing tenant config
 *
 * @param existing - Existing tenant config
 * @param update - Update DTO
 * @returns Updated tenant config
 */
export function applyTenantConfigUpdate(
  existing: TenantConfig,
  update: TenantConfigUpdate,
): TenantConfig {
  return {
    ...existing,
    ...update,
    // Deep merge for nested objects
    llm: update.llm ? { ...existing.llm, ...update.llm } : existing.llm,
    embedding: update.embedding
      ? { ...existing.embedding, ...update.embedding }
      : existing.embedding,
    prompts: update.prompts ? { ...existing.prompts, ...update.prompts } : existing.prompts,
    graphRag: update.graphRag ? { ...existing.graphRag, ...update.graphRag } : existing.graphRag,
    locale: update.locale ? { ...existing.locale, ...update.locale } : existing.locale,
    rateLimits: update.rateLimits
      ? { ...existing.rateLimits, ...update.rateLimits }
      : existing.rateLimits,
    features: update.features ? { ...existing.features, ...update.features } : existing.features,
    ingestion: update.ingestion
      ? { ...existing.ingestion, ...update.ingestion }
      : existing.ingestion,
    metadata: update.metadata ? { ...existing.metadata, ...update.metadata } : existing.metadata,
    // Update timestamp
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate config hash for cache invalidation
 *
 * @param config - Tenant config
 * @returns Hash string
 */
export function calculateConfigHash(config: TenantConfig): string {
  const { configHash, createdAt, updatedAt, ...rest } = config;
  // Simple hash based on JSON string
  const str = JSON.stringify(rest);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
