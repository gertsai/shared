import { z } from 'zod';
/**
 * User/operator types
 */
export var UserType;
(function (UserType) {
    UserType["USER"] = "user";
    UserType["BOT"] = "bot";
    UserType["SYSTEM"] = "system";
    UserType["SERVICE"] = "service";
    UserType["ADMIN"] = "admin";
    UserType["API_KEY"] = "api-key";
})(UserType || (UserType = {}));
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
