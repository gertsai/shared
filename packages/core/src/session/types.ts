import { z } from 'zod';

/**
 * Platform from which the request originated
 */
export type ClientPlatform =
  | 'web'
  | 'api'
  | 'cli'
  | 'sdk'
  | 'bot'
  | 'webhook'
  | `custom/${string}`;

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

/**
 * Mutation marks for audit trail (from orchestra/core/meta.ts)
 */
export const MutationMarksSchema = z.object({
  createdAt: z.date(),
  creatorId: z.string(),
  creatorPlatform: z.string(),

  updatedAt: z.date(),
  updatedById: z.string(),
  updatedByPlatform: z.string(),
});

export type MutationMarks = z.infer<typeof MutationMarksSchema>;

/**
 * Session operator (user/bot/system)
 */
export const OperatorSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(UserType),
  name: z.string().optional(),
  email: z.string().email().optional(),
  roles: z.array(z.string()).default([]),
});

export type Operator = z.infer<typeof OperatorSchema>;

/**
 * Request metadata
 */
export const RequestMetaSchema = z.object({
  requestId: z.string().uuid(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),

  clientPlatform: z.string(),
  clientVersion: z.string().optional(),
  clientIp: z.string().optional(),
  userAgent: z.string().optional(),

  startedAt: z.date(),
  timeout: z.number().default(30000),
});

export type RequestMeta = z.infer<typeof RequestMetaSchema>;

/**
 * GraphRAG-specific session settings
 */
export const GraphRAGSettingsSchema = z.object({
  // Search settings
  mode: z.enum(['local', 'global', 'hybrid', 'auto']).default('auto'),
  maxHops: z.number().min(1).max(5).default(2),
  topK: z.number().min(1).max(100).default(20),

  // Schema awareness
  useSchemaHints: z.boolean().default(true),
  ontologyMode: z.boolean().default(false),

  // Community settings
  communityLevel: z.number().min(0).max(3).default(0),
  includeCommunities: z.boolean().default(true),

  // Output settings
  includeEntities: z.boolean().default(true),
  includeRelationships: z.boolean().default(true),
  includeSources: z.boolean().default(true),
  maxTokens: z.number().default(4096),

  // Streaming
  streaming: z.boolean().default(false),
  streamChunkSize: z.number().default(100),
});

export type GraphRAGSettings = z.infer<typeof GraphRAGSettingsSchema>;

/**
 * IDestroyable interface (from orchestra/di)
 */
export interface IDestroyable {
  $destroy(): void;
}

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
