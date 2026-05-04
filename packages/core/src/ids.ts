export type Brand<T, B extends string> = T & { __brand: B };

export type Id<B extends string> = Brand<string, B>;

export type FlowId = Id<'flow'>;
export type ModuleId = Id<'module'>;
export type ExecutionId = Id<'execution'>;
export type TenantId = Id<'tenant'>;
export type UserId = Id<'user'>;
export type AgentId = Id<'agent'>;
export type TaskId = Id<'task'>;
export type SessionId = Id<'session'>;

export function toId<B extends string>(value: string): Id<B> {
  return value as Id<B>;
}

function createRandomValue(): string {
  const maybeCrypto = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybeCrypto?.randomUUID) return maybeCrypto.randomUUID();

  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2);
  return `${timePart}-${randomPart}`;
}

export function createId<B extends string>(prefix: B, value?: string): Id<B> {
  return `${prefix}:${value ?? createRandomValue()}` as Id<B>;
}

// Type-safe ID creators
export const createTenantId = (value?: string): TenantId => createId('tenant', value);
export const createUserId = (value?: string): UserId => createId('user', value);
export const createAgentId = (value?: string): AgentId => createId('agent', value);
export const createTaskId = (value?: string): TaskId => createId('task', value);
export const createSessionId = (value?: string): SessionId => createId('session', value);
export const createFlowId = (value?: string): FlowId => createId('flow', value);
export const createExecutionId = (value?: string): ExecutionId => createId('execution', value);

// Type guards for branded IDs
export function isTenantId(id: string): id is TenantId {
  return id.startsWith('tenant:');
}

export function isUserId(id: string): id is UserId {
  return id.startsWith('user:');
}

export function isAgentId(id: string): id is AgentId {
  return id.startsWith('agent:');
}
