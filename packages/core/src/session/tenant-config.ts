/**
 * TenantConfig types for GraphRAG Pipeline
 *
 * Two-layer configuration architecture:
 * - TenantConfig (persistent) - stored in PostgreSQL, cached in Redis
 * - SessionContext (request-scoped) - per-request, in-memory
 *
 * Uses Typia for compile-time validation (20,000x faster than Zod)
 * GraphRAGConfig uses Zod schema-first pattern for runtime validation.
 *
 * @example
 * ```typescript
 * const validation = validateTenantConfig(config);
 * if (validation.success) {
 *   const config = validation.data;
 * }
 * ```
 */

import { z } from 'zod';

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
export type EmbeddingProvider = 'openai' | 'azure' | 'infinity' | 'ollama' | 'litellm' | 'custom';

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
 * GraphRAG configuration schema (Zod-first)
 *
 * All fields optional — merged with DEFAULT_TENANT_CONFIG at runtime.
 * UI settings (gleaning, dedup, extraction tuning) are persisted here
 * and read by extract.ts via `GraphRAGConfigSchema.safeParse()`.
 */
export const GraphRAGConfigSchema = z.object({
  // --- Search ---
  /** Default search mode @default 'auto' */
  mode: z.enum(['local', 'global', 'hybrid', 'auto']).optional(),
  /** Max hops for local search @default 2 */
  maxHops: z.number().int().nonnegative().optional(),
  /** Number of results @default 20 */
  topK: z.number().int().positive().optional(),

  // --- Schema / Ontology ---
  /** Use schema hints for extraction @default true */
  useSchemaHints: z.boolean().optional(),
  /** Enable ontology mode @default false */
  ontologyMode: z.boolean().optional(),
  /** Default ontology ID for OntologyRAG extraction */
  defaultOntologyId: z.string().uuid().optional(),

  // --- Community ---
  /** Community hierarchy level @default 0 */
  communityLevel: z.number().int().nonnegative().optional(),
  /** Include communities in results @default true */
  includeCommunities: z.boolean().optional(),
  /** Community detection algorithm @default 'louvain' */
  communityAlgorithm: z.enum(['louvain', 'leiden']).optional(),
  /** Resolution parameter for community detection @default 1.0 */
  communityResolution: z.number().min(0.1).max(10).optional(),
  /** Maximum cluster size before splitting @default 100 */
  maxClusterSize: z.number().int().positive().optional(),
  /** Maximum hierarchy levels @default 3 */
  communityMaxLevels: z.number().int().min(1).max(10).optional(),

  // --- Results ---
  /** Include entities in results @default true */
  includeEntities: z.boolean().optional(),
  /** Include relationships in results @default true */
  includeRelationships: z.boolean().optional(),
  /** Include source chunks in results @default true */
  includeSources: z.boolean().optional(),
  /** Max tokens for response @default 4096 */
  maxTokens: z.number().int().positive().optional(),

  // --- Streaming ---
  /** Enable streaming @default false */
  streaming: z.boolean().optional(),
  /** Chunk size for streaming @default 100 */
  streamChunkSize: z.number().int().positive().optional(),

  // --- Extraction Types ---
  /** Entity types to extract (from ontology) */
  entityTypes: z.array(z.string()).optional(),
  /** Relationship types to extract (from ontology) */
  relationshipTypes: z.array(z.string()).optional(),

  // --- Gleaning (LLM re-extraction) ---
  /** Enable gleaning (multi-pass extraction) @default false */
  useGleaning: z.boolean().optional(),
  /** Max gleaning iterations @default 3 */
  maxGleaningIterations: z.number().int().min(1).max(10).optional(),

  // --- Deduplication ---
  /** Enable entity deduplication @default true */
  dedupEnabled: z.boolean().optional(),
  /** Minimum similarity for dedup match @default 0.85 */
  dedupMinSimilarity: z.number().min(0).max(1).optional(),
  /** Max dedup candidates per entity @default 50 */
  dedupMaxCandidates: z.number().int().positive().optional(),
  /** Enable alias detection during dedup @default true */
  dedupEnableAliases: z.boolean().optional(),

  // --- Extraction Tuning ---
  /** Enable numeric property extraction @default true */
  numericProperties: z.boolean().optional(),
  /** Batch size for extraction @default 10 */
  extractionBatchSize: z.number().int().positive().optional(),
  /** Concurrency for extraction @default 3 */
  extractionConcurrency: z.number().int().min(1).max(10).optional(),
  /** Max triples per chunk @default 100 */
  maxTriplesPerChunk: z.number().int().positive().optional(),

  // --- Ontology Hints ---
  /** Top-K ontology classes for hints @default 10 */
  ontologyTopKClasses: z.number().int().positive().optional(),
  /** Top-K ontology properties for hints @default 20 */
  ontologyTopKProperties: z.number().int().positive().optional(),
  /** Min score for ontology hint inclusion @default 0.5 */
  ontologyMinScore: z.number().min(0).max(1).optional(),
});

/** GraphRAG configuration for the tenant (inferred from Zod schema) */
export type GraphRAGConfig = z.infer<typeof GraphRAGConfigSchema>;

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
// Memory Settings (RFC-080)
// ============================================================================

/**
 * Memory layer identifiers
 */
export type MemoryLayer = 'session' | 'working' | 'longterm' | 'entity';

/**
 * Memory access policy
 *
 * - `open`: everyone sees everything within tenant
 * - `scoped`: users see own + chat scope; agents see own + project scope
 * - `strict`: users see only own; agents see only assigned scope
 */
export type MemoryAccessPolicy = 'open' | 'scoped' | 'strict';

/**
 * Memory configuration for the tenant
 *
 * Controls entity fact injection, token budgets, extraction behavior,
 * access policies, and layer toggles.
 * Used by chat completions memory bridge for per-tenant memory settings.
 *
 * @see RFC-080 Chat Agent Platform
 */
export interface MemoryConfig {
  /** Enable memory context injection into chat prompts @default true */
  enabled?: boolean;
  /** Maximum entity facts to inject into prompt (list-all fallback mode) @default 50 */
  maxFactsInContext?: number;
  /** Maximum tokens for memory context @default 1024 */
  maxContextTokens?: number;
  /** Enable async fact extraction from conversations @default true */
  factExtractionEnabled?: boolean;
  /** Auto-extract facts from conversations (alias for factExtractionEnabled) @default true */
  extractFacts?: boolean;
  /** Working memory TTL in hours @default 24 */
  ttlHours?: number;
  /** Maximum memory items per scope level @default 1000 */
  maxItemsPerScope?: number;
  /** Memory access policy controlling who can see what @default 'open' */
  accessPolicy?: MemoryAccessPolicy;
  /** Which memory layers are active for this tenant @default ['session','working','longterm','entity'] */
  enabledLayers?: MemoryLayer[];
}

// ============================================================================
// LLM Observability Settings (RFC-062)
// ============================================================================

/**
 * Observability configuration for the tenant
 *
 * Controls LLM tracing, metrics collection, and data retention.
 * Used by @gerts/observe for per-tenant sampling and storage settings.
 *
 * @see RFC-062 LLM Observability Platform
 */
export interface ObserveConfig {
  /** Enable observability for this tenant @default true */
  enabled?: boolean;

  /**
   * Sampling rate for traces (0.0 - 1.0)
   * - 1.0 = capture all traces (default)
   * - 0.5 = capture 50% of traces
   * - 0.0 = disable tracing
   * @default 1.0
   */
  sampleRate?: number;

  /** Trace retention in days (ClickHouse TTL) @default 30 */
  traceRetentionDays?: number;

  /** Generation data retention in days @default 90 */
  generationRetentionDays?: number;

  /**
   * Maximum payload size to store (KB)
   * Larger payloads are truncated to save storage
   * @default 100
   */
  maxPayloadSizeKb?: number;

  /**
   * Enable detailed input/output logging
   * When false, only metadata is stored (tokens, cost, latency)
   * @default true
   */
  logPayloads?: boolean;

  /**
   * Enable cost tracking
   * @default true
   */
  trackCost?: boolean;

  /**
   * Custom tags to add to all traces for this tenant
   */
  defaultTags?: string[];
}

// ============================================================================
// ACL Sync Settings (RFC-042)
// ============================================================================

/**
 * Identity resolution strategy for ACL sync
 *
 * - `strict`: Only sync permissions for users with explicit identity links.
 *   Best for enterprise deployments with strict access control.
 *
 * - `pending-grants`: Create pending grants for unknown emails,
 *   auto-apply when user signs up. Best for OSS/B2C deployments.
 *
 * @see RFC-042 Appendix I
 */
export type IdentityStrategy = 'strict' | 'pending-grants';

/**
 * OpenFGA tenancy mode
 *
 * - `shared`: Single OpenFGA store with tenant prefix in object IDs.
 *   Simpler, good for OSS/small deployments. REQUIRES SEC-001 fix.
 *
 * - `per-tenant`: Separate OpenFGA store per tenant.
 *   Stronger isolation, good for enterprise/compliance.
 *
 * @see RFC-042 Appendix I.7
 */
export type OpenFgaTenancyMode = 'shared' | 'per-tenant';

/**
 * Public document security settings
 */
export interface PublicDocsConfig {
  /**
   * Require admin approval before documents are marked public
   * Recommended for enterprise/compliance use cases
   * @default false
   */
  requireApproval?: boolean;

  /**
   * Maximum public documents per hour (rate limiting)
   * Prevents accidental mass exposure
   * @default 1000
   */
  rateLimitPerHour?: number;
}

/**
 * ACL Sync configuration for the tenant (RFC-042)
 *
 * Controls how access control lists are synchronized from
 * external sources (Google Drive, Slack, Confluence, etc.)
 * to OpenFGA for query-time enforcement.
 *
 * @see RFC-042 Data Connectors with Mirrored ACL
 * @see RFC-042 Appendix I: Architecture Decisions
 */
export interface AclSyncConfig {
  /**
   * Enable ACL sync for this tenant
   * When disabled, all documents are accessible to all tenant users
   * @default true
   */
  enabled?: boolean;

  /**
   * Maximum acceptable revocation lag in seconds
   *
   * Time between permission revocation in source (e.g., Google Drive)
   * and enforcement in OpenFGA queries.
   *
   * Lower values = more frequent polling = higher API costs
   * - Enterprise: 15 (critical for security)
   * - OSS/B2C: 300 (5 minutes, acceptable for most cases)
   *
   * @default 300
   */
  maxRevocationLagSeconds?: number;

  /**
   * Identity resolution strategy
   *
   * - `strict`: Only users with explicit identity links get access
   * - `pending-grants`: Unknown emails get pending grants, applied on signup
   *
   * @default 'pending-grants'
   */
  identityStrategy?: IdentityStrategy;

  /**
   * TTL for pending grants in days
   * Grants expire after this period if user doesn't sign up
   * @default 90
   */
  pendingGrantTtlDays?: number;

  /**
   * Trusted email domains for automatic guest user provisioning
   *
   * Users from these domains get guest accounts automatically
   * when their email appears in ACL sync (without explicit signup).
   *
   * Example: ['company.com', 'partner.org']
   *
   * @security SAML/LDAP may auto-populate this from IdP metadata
   */
  trustedDomains?: string[];

  /**
   * Public document security settings
   */
  publicDocs?: PublicDocsConfig;

  /**
   * OpenFGA tenancy mode
   *
   * - `shared`: Single store with tenant prefix (simpler)
   * - `per-tenant`: Dedicated store per tenant (stronger isolation)
   *
   * @default 'shared'
   */
  openFgaTenancyMode?: OpenFgaTenancyMode;

  /**
   * OpenFGA store ID (only for `per-tenant` mode)
   * Auto-generated if not provided
   */
  openFgaStoreId?: string;
}

// ============================================================================
// Deny Ledger Settings (RFC-042)
// ============================================================================

/**
 * Deny Ledger provider mode
 *
 * - `memory`: In-memory LRU cache + PostgreSQL backup (OSS default)
 * - `redis`: Redis primary + PostgreSQL backup (Enterprise)
 * - `postgres-only`: PostgreSQL only, no cache (max durability)
 */
export type DenyLedgerMode = 'memory' | 'redis' | 'postgres-only';

/**
 * Deny Ledger configuration for the tenant (RFC-042)
 *
 * Controls persistent storage for access denials.
 * Ensures security state survives service restarts.
 *
 * @see RFC-042 Appendix I.5 - Deny Ledger Architecture
 */
export interface DenyLedgerConfig {
  /**
   * Provider mode
   * @default 'memory'
   */
  mode?: DenyLedgerMode;

  /**
   * Cache TTL for deny entries (seconds)
   * Entries are refreshed from PostgreSQL after this time
   * @default 3600 (1 hour)
   */
  cacheTtlSeconds?: number;

  /**
   * Default TTL for brute-force lockouts (seconds)
   * @default 900 (15 minutes)
   */
  bruteForceExpireSeconds?: number;

  /**
   * Max entries in memory cache (LRU eviction)
   * @default 10000
   */
  maxCacheSize?: number;

  /**
   * Enable NATS pub/sub for multi-node sync
   * @default false
   */
  enableNatsSync?: boolean;
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

  /** Memory settings (RFC-080) */
  memory?: MemoryConfig;

  /** LLM Observability settings (RFC-062) */
  observe?: ObserveConfig;

  /** ACL Sync settings (RFC-042) */
  aclSync?: AclSyncConfig;

  /** Deny Ledger settings (RFC-042) */
  denyLedger?: DenyLedgerConfig;

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
  /** Optional: Memory settings (RFC-080) */
  memory?: MemoryConfig;
  /** Optional: LLM Observability settings (RFC-062) */
  observe?: ObserveConfig;
  /** Optional: ACL Sync settings (RFC-042) */
  aclSync?: AclSyncConfig;
  /** Optional: Deny Ledger settings (RFC-042) */
  denyLedger?: DenyLedgerConfig;
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
  /** Memory settings (RFC-080) */
  memory?: Partial<MemoryConfig>;
  /** LLM Observability settings (RFC-062) */
  observe?: Partial<ObserveConfig>;
  /** ACL Sync settings (RFC-042) */
  aclSync?: Partial<AclSyncConfig>;
  /** Deny Ledger settings (RFC-042) */
  denyLedger?: Partial<DenyLedgerConfig>;
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
    ['openai', 'azure', 'infinity', 'ollama', 'litellm', 'custom'].includes(v.provider) &&
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
    // Gleaning
    useGleaning: true,
    maxGleaningIterations: 1,
    // Deduplication
    dedupEnabled: true,
    dedupMinSimilarity: 0.85,
    dedupMaxCandidates: 5,
    dedupEnableAliases: true,
    // Extraction tuning
    numericProperties: true,
    extractionBatchSize: 10,
    extractionConcurrency: 3,
    maxTriplesPerChunk: 50,
    // Community
    communityAlgorithm: 'louvain' as const,
    communityResolution: 1.5,
    maxClusterSize: 100,
    communityMaxLevels: 3,
    // Ontology hints
    ontologyTopKClasses: 20,
    ontologyTopKProperties: 30,
    ontologyMinScore: 0.3,
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
  memory: {
    enabled: true,
    maxFactsInContext: 50,
    maxContextTokens: 1024,
    factExtractionEnabled: true,
    extractFacts: true,
    ttlHours: 24,
    maxItemsPerScope: 1000,
    accessPolicy: 'open',
    enabledLayers: ['session', 'working', 'longterm', 'entity'],
  },
  observe: {
    enabled: true,
    sampleRate: 1.0, // Capture all traces by default
    traceRetentionDays: 30,
    generationRetentionDays: 90,
    maxPayloadSizeKb: 100,
    logPayloads: true,
    trackCost: true,
    defaultTags: [],
  },
  aclSync: {
    enabled: true,
    maxRevocationLagSeconds: 300, // 5 minutes (OSS default)
    identityStrategy: 'pending-grants', // OSS default
    pendingGrantTtlDays: 90,
    trustedDomains: [],
    publicDocs: {
      requireApproval: false, // OSS default
      rateLimitPerHour: 1000,
    },
    openFgaTenancyMode: 'shared', // OSS default
  },
  denyLedger: {
    mode: 'memory', // OSS default
    cacheTtlSeconds: 3600, // 1 hour
    bruteForceExpireSeconds: 900, // 15 minutes
    maxCacheSize: 10000,
    enableNatsSync: false,
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
    memory: {
      ...DEFAULT_TENANT_CONFIG.memory,
      ...config.memory,
    },
    observe: {
      ...DEFAULT_TENANT_CONFIG.observe,
      ...config.observe,
    },
    aclSync: {
      ...DEFAULT_TENANT_CONFIG.aclSync,
      ...config.aclSync,
      publicDocs: {
        ...DEFAULT_TENANT_CONFIG.aclSync?.publicDocs,
        ...config.aclSync?.publicDocs,
      },
    },
    denyLedger: {
      ...DEFAULT_TENANT_CONFIG.denyLedger,
      ...config.denyLedger,
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
    memory: update.memory ? { ...existing.memory, ...update.memory } : existing.memory,
    observe: update.observe ? { ...existing.observe, ...update.observe } : existing.observe,
    aclSync: update.aclSync
      ? {
          ...existing.aclSync,
          ...update.aclSync,
          publicDocs: update.aclSync.publicDocs
            ? { ...existing.aclSync?.publicDocs, ...update.aclSync.publicDocs }
            : existing.aclSync?.publicDocs,
        }
      : existing.aclSync,
    denyLedger: update.denyLedger
      ? { ...existing.denyLedger, ...update.denyLedger }
      : existing.denyLedger,
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

// ============================================================================
// Sanitized Config (for inter-service propagation)
// ============================================================================

/**
 * Sanitized LLM configuration without sensitive fields
 *
 * Removes: apiKeyRef, baseUrl (credentials that should not leak via ctx.meta)
 * Keeps: provider, model, temperature, maxTokens, timeout
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 */
export type SanitizedTenantLLMConfig = Omit<TenantLLMConfig, 'apiKeyRef' | 'baseUrl'>;

/**
 * Sanitized Embedding configuration without sensitive fields
 *
 * Removes: apiKeyRef, baseUrl (credentials that should not leak via ctx.meta)
 * Keeps: provider, model, dimension, batchSize
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 */
export type SanitizedEmbeddingConfig = Omit<EmbeddingConfig, 'apiKeyRef' | 'baseUrl'>;

/**
 * Sanitized TenantConfig for safe propagation via ctx.meta
 *
 * This type represents a TenantConfig with sensitive fields removed from
 * llm and embedding configurations. Use this for inter-service communication
 * where credentials should not be exposed.
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 *
 * @example
 * ```typescript
 * // In session middleware
 * ctx.meta.tenantConfig = sanitizeTenantConfig(response.data);  // Safe for propagation
 * ctx.locals.tenantConfig = response.data;  // Full config, server-side only
 * ```
 */
export type SanitizedTenantConfig = Omit<TenantConfig, 'llm' | 'embedding'> & {
  /** Sanitized LLM configuration (without apiKeyRef, baseUrl) */
  llm: SanitizedTenantLLMConfig;
  /** Sanitized Embedding configuration (without apiKeyRef, baseUrl) */
  embedding: SanitizedEmbeddingConfig;
};

/**
 * Sanitizes TenantConfig for safe propagation via ctx.meta
 *
 * Removes sensitive fields from LLM and Embedding configs:
 * - apiKeyRef: Vault reference to API key
 * - baseUrl: Custom endpoint URL (may contain auth tokens)
 *
 * Use this function when passing TenantConfig through ctx.meta to prevent
 * credential leakage during inter-service calls.
 *
 * @param config - Full TenantConfig with sensitive fields
 * @returns SanitizedTenantConfig safe for inter-service propagation
 *
 * @security RISK-003 - Prevents credential leak via inter-service calls
 *
 * @example
 * ```typescript
 * // In session middleware (line ~732)
 * import { sanitizeTenantConfig } from '@gerts/core';
 *
 * // BEFORE (vulnerable)
 * ctx.meta.tenantConfig = response.data;
 *
 * // AFTER (safe)
 * ctx.meta.tenantConfig = sanitizeTenantConfig(response.data);  // Safe for propagation
 * ctx.locals.tenantConfig = response.data;  // Full config, server-side only
 * ```
 */
export function sanitizeTenantConfig(config: TenantConfig): SanitizedTenantConfig {
  // Destructure to remove sensitive LLM fields
  const { apiKeyRef: _llmApiKey, baseUrl: _llmBaseUrl, ...sanitizedLlm } = config.llm;

  // Destructure to remove sensitive Embedding fields
  const {
    apiKeyRef: _embeddingApiKey,
    baseUrl: _embeddingBaseUrl,
    ...sanitizedEmbedding
  } = config.embedding;

  // Return config with sanitized nested objects
  return {
    ...config,
    llm: sanitizedLlm,
    embedding: sanitizedEmbedding,
  };
}

/**
 * Check if value is a SanitizedTenantConfig
 *
 * Validates that the config is a valid TenantConfig structure
 * AND does not contain sensitive fields (apiKeyRef, baseUrl).
 *
 * @param value - Value to check
 * @returns True if value is a valid SanitizedTenantConfig
 *
 * @security RISK-003 - Runtime validation for sanitized configs
 */
export function isSanitizedTenantConfig(value: unknown): value is SanitizedTenantConfig {
  // First check if it's a valid TenantConfig structure
  if (!isTenantConfig(value)) return false;

  const config = value as TenantConfig;

  // Verify LLM config does NOT have sensitive fields
  if ('apiKeyRef' in config.llm || 'baseUrl' in config.llm) {
    return false;
  }

  // Verify Embedding config does NOT have sensitive fields
  if ('apiKeyRef' in config.embedding || 'baseUrl' in config.embedding) {
    return false;
  }

  return true;
}
