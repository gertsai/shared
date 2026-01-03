import { z } from 'zod';
/**
 * Platform from which the request originated
 */
export type ClientPlatform = 'web' | 'api' | 'cli' | 'sdk' | 'bot' | 'webhook' | `custom/${string}`;
/**
 * User/operator types
 */
export declare enum UserType {
    USER = "user",
    BOT = "bot",
    SYSTEM = "system",
    SERVICE = "service",
    ADMIN = "admin",
    API_KEY = "api-key"
}
/**
 * Mutation marks for audit trail (from orchestra/core/meta.ts)
 */
export declare const MutationMarksSchema: z.ZodObject<{
    createdAt: z.ZodDate;
    creatorId: z.ZodString;
    creatorPlatform: z.ZodString;
    updatedAt: z.ZodDate;
    updatedById: z.ZodString;
    updatedByPlatform: z.ZodString;
}, "strip", z.ZodTypeAny, {
    createdAt: Date;
    updatedAt: Date;
    creatorId: string;
    creatorPlatform: string;
    updatedById: string;
    updatedByPlatform: string;
}, {
    createdAt: Date;
    updatedAt: Date;
    creatorId: string;
    creatorPlatform: string;
    updatedById: string;
    updatedByPlatform: string;
}>;
export type MutationMarks = z.infer<typeof MutationMarksSchema>;
/**
 * Session operator (user/bot/system)
 */
export declare const OperatorSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof UserType>;
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    roles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: UserType;
    id: string;
    roles: string[];
    name?: string | undefined;
    email?: string | undefined;
}, {
    type: UserType;
    id: string;
    name?: string | undefined;
    email?: string | undefined;
    roles?: string[] | undefined;
}>;
export type Operator = z.infer<typeof OperatorSchema>;
/**
 * Request metadata
 */
export declare const RequestMetaSchema: z.ZodObject<{
    requestId: z.ZodString;
    traceId: z.ZodOptional<z.ZodString>;
    spanId: z.ZodOptional<z.ZodString>;
    parentSpanId: z.ZodOptional<z.ZodString>;
    clientPlatform: z.ZodString;
    clientVersion: z.ZodOptional<z.ZodString>;
    clientIp: z.ZodOptional<z.ZodString>;
    userAgent: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodDate;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    requestId: string;
    clientPlatform: string;
    startedAt: Date;
    traceId?: string | undefined;
    spanId?: string | undefined;
    parentSpanId?: string | undefined;
    clientVersion?: string | undefined;
    clientIp?: string | undefined;
    userAgent?: string | undefined;
}, {
    requestId: string;
    clientPlatform: string;
    startedAt: Date;
    timeout?: number | undefined;
    traceId?: string | undefined;
    spanId?: string | undefined;
    parentSpanId?: string | undefined;
    clientVersion?: string | undefined;
    clientIp?: string | undefined;
    userAgent?: string | undefined;
}>;
export type RequestMeta = z.infer<typeof RequestMetaSchema>;
/**
 * GraphRAG-specific session settings
 */
export declare const GraphRAGSettingsSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["local", "global", "hybrid", "auto"]>>;
    maxHops: z.ZodDefault<z.ZodNumber>;
    topK: z.ZodDefault<z.ZodNumber>;
    useSchemaHints: z.ZodDefault<z.ZodBoolean>;
    ontologyMode: z.ZodDefault<z.ZodBoolean>;
    communityLevel: z.ZodDefault<z.ZodNumber>;
    includeCommunities: z.ZodDefault<z.ZodBoolean>;
    includeEntities: z.ZodDefault<z.ZodBoolean>;
    includeRelationships: z.ZodDefault<z.ZodBoolean>;
    includeSources: z.ZodDefault<z.ZodBoolean>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    streaming: z.ZodDefault<z.ZodBoolean>;
    streamChunkSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    mode: "hybrid" | "local" | "global" | "auto";
    maxTokens: number;
    streaming: boolean;
    topK: number;
    maxHops: number;
    useSchemaHints: boolean;
    ontologyMode: boolean;
    communityLevel: number;
    includeCommunities: boolean;
    includeEntities: boolean;
    includeRelationships: boolean;
    includeSources: boolean;
    streamChunkSize: number;
}, {
    mode?: "hybrid" | "local" | "global" | "auto" | undefined;
    maxTokens?: number | undefined;
    streaming?: boolean | undefined;
    topK?: number | undefined;
    maxHops?: number | undefined;
    useSchemaHints?: boolean | undefined;
    ontologyMode?: boolean | undefined;
    communityLevel?: number | undefined;
    includeCommunities?: boolean | undefined;
    includeEntities?: boolean | undefined;
    includeRelationships?: boolean | undefined;
    includeSources?: boolean | undefined;
    streamChunkSize?: number | undefined;
}>;
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
//# sourceMappingURL=types.d.ts.map