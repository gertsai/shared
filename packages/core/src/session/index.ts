// Types
export {
  UserType,
  type ClientPlatform,
  type MutationMarks,
  type Operator,
  type RequestMeta,
  type GraphRAGSettings,
  type IDestroyable,
  type UsersMetaType,
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
  type GraphRAGConfig,
  type LocaleConfig,
  type RateLimitConfig,
  type FeatureFlags,
  type IngestionConfig,
  type CommunityLevel,
  type TenantConfig,
  type TenantConfigCreate,
  type TenantConfigUpdate,
  type ResolvedTenantConfig,
  // Runtime type guards
  isTenantLLMConfig,
  isEmbeddingConfig,
  isTenantConfig,
  isTenantConfigCreate,
  isTenantConfigUpdate,
  // Defaults & Helpers
  DEFAULT_TENANT_CONFIG,
  mergeTenantConfigWithDefaults,
  applyTenantConfigUpdate,
  calculateConfigHash,
} from './tenant-config';
