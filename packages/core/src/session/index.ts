// Types
export {
  // Enums
  UserType,
  // Type aliases
  type ClientPlatform,
  type GraphRAGSearchMode,
  // Interfaces
  type MutationMarks,
  type Operator,
  type RequestMeta,
  type GraphRAGSettings,
  type IDestroyable,
  type UsersMetaType,
  // Type guards
  isMutationMarks,
  isOperator,
  isRequestMeta,
  isGraphRAGSettings,
  // Factory functions
  createMutationMarks,
  createOperator,
  createSystemOperator,
  createRequestMeta,
  createGraphRAGSettings,
  // Constants
  DEFAULT_TIMEOUT,
  DEFAULT_GRAPHRAG_SETTINGS,
  // Deprecated Zod-compatible schemas (for backwards compatibility)
  MutationMarksSchema,
  OperatorSchema,
  RequestMetaSchema,
  GraphRAGSettingsSchema,
} from './types';

// Session Context
export {
  GraphRAGSessionContext,
  createSession,
  defaultSession,
  createSessionFactory,
  createSystemSession,
  type SessionContextConfig,
  type SerializedSessionContext,
  type SessionFactory,
  // Aliases for Orchestra compatibility
  type OrchestraSession,
  type GertsSession,
} from './session-context';

// Tenant Config types
export {
  // Types
  type TenantLLMProvider,
  type TenantLLMConfig,
  type EmbeddingProvider,
  type EmbeddingConfig,
  type PromptConfig,
  type OntologyBinding,
  type GraphRAGMode,
  GraphRAGConfigSchema,
  type GraphRAGConfig,
  type LocaleConfig,
  type RateLimitConfig,
  type FeatureFlags,
  type IngestionConfig,
  type ObserveConfig,
  type CommunityLevel,
  type TenantConfig,
  type TenantConfigCreate,
  type TenantConfigUpdate,
  type ResolvedTenantConfig,
  // Sanitized types (RISK-003)
  type SanitizedTenantLLMConfig,
  type SanitizedEmbeddingConfig,
  type SanitizedTenantConfig,
  // Runtime type guards
  isTenantLLMConfig,
  isEmbeddingConfig,
  isTenantConfig,
  isTenantConfigCreate,
  isTenantConfigUpdate,
  isSanitizedTenantConfig,
  // Defaults & Helpers
  DEFAULT_TENANT_CONFIG,
  mergeTenantConfigWithDefaults,
  applyTenantConfigUpdate,
  calculateConfigHash,
  // Sanitization (RISK-003)
  sanitizeTenantConfig,
} from './tenant-config';
