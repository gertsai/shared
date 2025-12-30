export type Brand<T, B extends string> = T & {
    __brand: B;
};
export type Id<B extends string> = Brand<string, B>;
export type FlowId = Id<'flow'>;
export type ModuleId = Id<'module'>;
export type ExecutionId = Id<'execution'>;
export type TenantId = Id<'tenant'>;
export type UserId = Id<'user'>;
export type AgentId = Id<'agent'>;
export type TaskId = Id<'task'>;
export type SessionId = Id<'session'>;
export declare function toId<B extends string>(value: string): Id<B>;
export declare function createId<B extends string>(prefix: B, value?: string): Id<B>;
export declare const createTenantId: (value?: string) => TenantId;
export declare const createUserId: (value?: string) => UserId;
export declare const createAgentId: (value?: string) => AgentId;
export declare const createTaskId: (value?: string) => TaskId;
export declare const createSessionId: (value?: string) => SessionId;
export declare const createFlowId: (value?: string) => FlowId;
export declare const createExecutionId: (value?: string) => ExecutionId;
export declare function isTenantId(id: string): id is TenantId;
export declare function isUserId(id: string): id is UserId;
export declare function isAgentId(id: string): id is AgentId;
//# sourceMappingURL=ids.d.ts.map