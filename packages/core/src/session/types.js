"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphRAGSettingsSchema = exports.RequestMetaSchema = exports.OperatorSchema = exports.MutationMarksSchema = exports.UserType = void 0;
const zod_1 = require("zod");
/**
 * User/operator types
 */
var UserType;
(function (UserType) {
    UserType["USER"] = "user";
    UserType["BOT"] = "bot";
    UserType["SYSTEM"] = "system";
    UserType["SERVICE"] = "service";
    UserType["ADMIN"] = "admin";
    UserType["API_KEY"] = "api-key";
})(UserType || (exports.UserType = UserType = {}));
/**
 * Mutation marks for audit trail (from orchestra/core/meta.ts)
 */
exports.MutationMarksSchema = zod_1.z.object({
    createdAt: zod_1.z.date(),
    creatorId: zod_1.z.string(),
    creatorPlatform: zod_1.z.string(),
    updatedAt: zod_1.z.date(),
    updatedById: zod_1.z.string(),
    updatedByPlatform: zod_1.z.string(),
});
/**
 * Session operator (user/bot/system)
 */
exports.OperatorSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.nativeEnum(UserType),
    name: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    roles: zod_1.z.array(zod_1.z.string()).default([]),
});
/**
 * Request metadata
 */
exports.RequestMetaSchema = zod_1.z.object({
    requestId: zod_1.z.string().uuid(),
    traceId: zod_1.z.string().optional(),
    spanId: zod_1.z.string().optional(),
    parentSpanId: zod_1.z.string().optional(),
    clientPlatform: zod_1.z.string(),
    clientVersion: zod_1.z.string().optional(),
    clientIp: zod_1.z.string().optional(),
    userAgent: zod_1.z.string().optional(),
    startedAt: zod_1.z.date(),
    timeout: zod_1.z.number().default(30000),
});
/**
 * GraphRAG-specific session settings
 */
exports.GraphRAGSettingsSchema = zod_1.z.object({
    // Search settings
    mode: zod_1.z.enum(['local', 'global', 'hybrid', 'auto']).default('auto'),
    maxHops: zod_1.z.number().min(1).max(5).default(2),
    topK: zod_1.z.number().min(1).max(100).default(20),
    // Schema awareness
    useSchemaHints: zod_1.z.boolean().default(true),
    ontologyMode: zod_1.z.boolean().default(false),
    // Community settings
    communityLevel: zod_1.z.number().min(0).max(3).default(0),
    includeCommunities: zod_1.z.boolean().default(true),
    // Output settings
    includeEntities: zod_1.z.boolean().default(true),
    includeRelationships: zod_1.z.boolean().default(true),
    includeSources: zod_1.z.boolean().default(true),
    maxTokens: zod_1.z.number().default(4096),
    // Streaming
    streaming: zod_1.z.boolean().default(false),
    streamChunkSize: zod_1.z.number().default(100),
});
