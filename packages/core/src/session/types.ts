/**
 * Session types for GraphRAG Pipeline
 *
 * Migrated from Zod to pure TypeScript interfaces with manual type guards.
 * This removes the Zod dependency from @gerts/core for better performance
 * and simpler bundle size.
 *
 * Note: For runtime validation in apps/pipeline, use Typia validators.
 */

// ============================================================================
// Client Platform
// ============================================================================

/**
 * Platform from which the request originated
 */
export type ClientPlatform = 'web' | 'api' | 'cli' | 'sdk' | 'bot' | 'webhook' | `custom/${string}`;

// ============================================================================
// User Types
// ============================================================================

/**
 * User/operator types
 */
export enum UserType {
  USER = 'user',
  BOT = 'bot',
  SYSTEM = 'system',
  SERVICE = 'service',
  ADMIN = 'admin',
  API_KEY = 'api-key',
}

// ============================================================================
// Mutation Marks
// ============================================================================

/**
 * Mutation marks for audit trail (from orchestra/core/meta.ts)
 */
export interface MutationMarks {
  createdAt: Date;
  creatorId: string;
  creatorPlatform: string;

  updatedAt: Date;
  updatedById: string;
  updatedByPlatform: string;
}

/**
 * Check if value is a valid MutationMarks object
 */
export function isMutationMarks(value: unknown): value is MutationMarks {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.createdAt instanceof Date &&
    typeof v.creatorId === 'string' &&
    typeof v.creatorPlatform === 'string' &&
    v.updatedAt instanceof Date &&
    typeof v.updatedById === 'string' &&
    typeof v.updatedByPlatform === 'string'
  );
}

/**
 * Create default MutationMarks
 */
export function createMutationMarks(creatorId: string, creatorPlatform: string): MutationMarks {
  const now = new Date();
  return {
    createdAt: now,
    creatorId,
    creatorPlatform,
    updatedAt: now,
    updatedById: creatorId,
    updatedByPlatform: creatorPlatform,
  };
}

// ============================================================================
// Operator (Session User)
// ============================================================================

/**
 * Session operator (user/bot/system)
 */
export interface Operator {
  /** Unique operator identifier */
  id: string;
  /** Operator type */
  type: UserType;
  /** Display name */
  name?: string;
  /** Email address */
  email?: string;
  /** Assigned roles */
  roles: string[];
}

/**
 * Check if value is a valid Operator object
 */
export function isOperator(value: unknown): value is Operator {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    Object.values(UserType).includes(v.type as UserType) &&
    (v.name === undefined || typeof v.name === 'string') &&
    (v.email === undefined || typeof v.email === 'string') &&
    Array.isArray(v.roles) &&
    v.roles.every((r) => typeof r === 'string')
  );
}

/**
 * Create default Operator
 */
export function createOperator(
  id: string,
  type: UserType = UserType.USER,
  roles: string[] = [],
): Operator {
  return { id, type, roles };
}

/**
 * Create system operator
 */
export function createSystemOperator(): Operator {
  return createOperator('system', UserType.SYSTEM, ['system']);
}

// ============================================================================
// Request Metadata
// ============================================================================

/**
 * Request metadata
 */
export interface RequestMeta {
  /** Unique request identifier (UUID) */
  requestId: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID for distributed tracing */
  spanId?: string;
  /** Parent span ID for distributed tracing */
  parentSpanId?: string;

  /** Client platform identifier */
  clientPlatform: string;
  /** Client version */
  clientVersion?: string;
  /** Client IP address */
  clientIp?: string;
  /** User agent string */
  userAgent?: string;

  /** Request start timestamp */
  startedAt: Date;
  /** Request timeout in milliseconds @default 30000 */
  timeout: number;
}

/**
 * Check if value is a valid RequestMeta object
 */
export function isRequestMeta(value: unknown): value is RequestMeta {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.requestId === 'string' &&
    (v.traceId === undefined || typeof v.traceId === 'string') &&
    (v.spanId === undefined || typeof v.spanId === 'string') &&
    (v.parentSpanId === undefined || typeof v.parentSpanId === 'string') &&
    typeof v.clientPlatform === 'string' &&
    (v.clientVersion === undefined || typeof v.clientVersion === 'string') &&
    (v.clientIp === undefined || typeof v.clientIp === 'string') &&
    (v.userAgent === undefined || typeof v.userAgent === 'string') &&
    v.startedAt instanceof Date &&
    typeof v.timeout === 'number'
  );
}

/**
 * Default timeout in milliseconds
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Create RequestMeta with defaults
 */
export function createRequestMeta(
  requestId: string,
  clientPlatform: string,
  options: Partial<Omit<RequestMeta, 'requestId' | 'clientPlatform'>> = {},
): RequestMeta {
  return {
    requestId,
    clientPlatform,
    startedAt: options.startedAt ?? new Date(),
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    ...options,
  };
}

// ============================================================================
// GraphRAG Settings
// ============================================================================

/**
 * GraphRAG search mode
 */
export type GraphRAGSearchMode = 'local' | 'global' | 'hybrid' | 'auto';

/**
 * GraphRAG-specific session settings
 */
export interface GraphRAGSettings {
  // Search settings
  /** Search mode @default 'auto' */
  mode: GraphRAGSearchMode;
  /** Max hops for local search @default 2 */
  maxHops: number;
  /** Number of results @default 20 */
  topK: number;

  // Schema awareness
  /** Use schema hints for extraction @default true */
  useSchemaHints: boolean;
  /** Enable ontology mode @default false */
  ontologyMode: boolean;

  // Community settings
  /** Community hierarchy level @default 0 */
  communityLevel: number;
  /** Include communities in results @default true */
  includeCommunities: boolean;

  // Output settings
  /** Include entities in results @default true */
  includeEntities: boolean;
  /** Include relationships in results @default true */
  includeRelationships: boolean;
  /** Include source chunks in results @default true */
  includeSources: boolean;
  /** Max tokens for response @default 4096 */
  maxTokens: number;

  // Streaming
  /** Enable streaming @default false */
  streaming: boolean;
  /** Chunk size for streaming @default 100 */
  streamChunkSize: number;
}

/**
 * Default GraphRAG settings
 */
export const DEFAULT_GRAPHRAG_SETTINGS: GraphRAGSettings = {
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
};

/**
 * Check if value is a valid GraphRAGSettings object
 */
export function isGraphRAGSettings(value: unknown): value is GraphRAGSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const validModes: GraphRAGSearchMode[] = ['local', 'global', 'hybrid', 'auto'];
  return (
    typeof v.mode === 'string' &&
    validModes.includes(v.mode as GraphRAGSearchMode) &&
    typeof v.maxHops === 'number' &&
    v.maxHops >= 1 &&
    v.maxHops <= 5 &&
    typeof v.topK === 'number' &&
    v.topK >= 1 &&
    v.topK <= 100 &&
    typeof v.useSchemaHints === 'boolean' &&
    typeof v.ontologyMode === 'boolean' &&
    typeof v.communityLevel === 'number' &&
    v.communityLevel >= 0 &&
    v.communityLevel <= 3 &&
    typeof v.includeCommunities === 'boolean' &&
    typeof v.includeEntities === 'boolean' &&
    typeof v.includeRelationships === 'boolean' &&
    typeof v.includeSources === 'boolean' &&
    typeof v.maxTokens === 'number' &&
    typeof v.streaming === 'boolean' &&
    typeof v.streamChunkSize === 'number'
  );
}

/**
 * Create GraphRAGSettings with defaults
 */
export function createGraphRAGSettings(options: Partial<GraphRAGSettings> = {}): GraphRAGSettings {
  return {
    ...DEFAULT_GRAPHRAG_SETTINGS,
    ...options,
  };
}

// ============================================================================
// IDestroyable Interface
// ============================================================================

/**
 * IDestroyable interface (from orchestra/di)
 */
export interface IDestroyable {
  $destroy(): void;
}

// ============================================================================
// User Metadata Type
// ============================================================================

/**
 * User metadata type (Firestore entity meta)
 * Simplified version for pipeline - full version in Orchestra SDK
 */
export interface UsersMetaType {
  data: {
    _uid: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    type: UserType;
    roles?: string[];
  };
  create: {
    email: string;
    displayName?: string;
    type: UserType;
  };
}

// ============================================================================
// Deprecated Zod Schemas (for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use MutationMarks interface and isMutationMarks() type guard instead.
 * This is kept for backwards compatibility but will be removed in next major version.
 */
export const MutationMarksSchema = {
  /** @deprecated */
  parse: (value: unknown): MutationMarks => {
    if (!isMutationMarks(value)) {
      throw new Error('Invalid MutationMarks');
    }
    return value;
  },
  /** @deprecated */
  safeParse: (value: unknown) => {
    if (isMutationMarks(value)) {
      return { success: true as const, data: value };
    }
    return { success: false as const, error: new Error('Invalid MutationMarks') };
  },
};

/**
 * @deprecated Use Operator interface and isOperator() type guard instead.
 * This is kept for backwards compatibility but will be removed in next major version.
 */
export const OperatorSchema = {
  /** @deprecated */
  parse: (value: unknown): Operator => {
    if (!isOperator(value)) {
      throw new Error('Invalid Operator');
    }
    return value;
  },
  /** @deprecated */
  safeParse: (value: unknown) => {
    if (isOperator(value)) {
      return { success: true as const, data: value };
    }
    return { success: false as const, error: new Error('Invalid Operator') };
  },
};

/**
 * @deprecated Use RequestMeta interface and isRequestMeta() type guard instead.
 * This is kept for backwards compatibility but will be removed in next major version.
 */
export const RequestMetaSchema = {
  /** @deprecated */
  parse: (value: unknown): RequestMeta => {
    if (!isRequestMeta(value)) {
      throw new Error('Invalid RequestMeta');
    }
    return value;
  },
  /** @deprecated */
  safeParse: (value: unknown) => {
    if (isRequestMeta(value)) {
      return { success: true as const, data: value };
    }
    return { success: false as const, error: new Error('Invalid RequestMeta') };
  },
};

/**
 * @deprecated Use GraphRAGSettings interface and isGraphRAGSettings() type guard instead.
 * This is kept for backwards compatibility but will be removed in next major version.
 */
export const GraphRAGSettingsSchema = {
  /** @deprecated */
  parse: (value: unknown): GraphRAGSettings => {
    if (!isGraphRAGSettings(value)) {
      throw new Error('Invalid GraphRAGSettings');
    }
    return value;
  },
  /** @deprecated */
  safeParse: (value: unknown) => {
    if (isGraphRAGSettings(value)) {
      return { success: true as const, data: value };
    }
    return { success: false as const, error: new Error('Invalid GraphRAGSettings') };
  },
};
