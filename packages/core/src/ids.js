export function toId(value) {
    return value;
}
function createRandomValue() {
    const maybeCrypto = globalThis.crypto;
    if (maybeCrypto?.randomUUID)
        return maybeCrypto.randomUUID();
    const timePart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2);
    return `${timePart}-${randomPart}`;
}
export function createId(prefix, value) {
    return `${prefix}:${value ?? createRandomValue()}`;
}
// Type-safe ID creators
export const createTenantId = (value) => createId('tenant', value);
export const createUserId = (value) => createId('user', value);
export const createAgentId = (value) => createId('agent', value);
export const createTaskId = (value) => createId('task', value);
export const createSessionId = (value) => createId('session', value);
export const createFlowId = (value) => createId('flow', value);
export const createExecutionId = (value) => createId('execution', value);
// Type guards for branded IDs
export function isTenantId(id) {
    return id.startsWith('tenant:');
}
export function isUserId(id) {
    return id.startsWith('user:');
}
export function isAgentId(id) {
    return id.startsWith('agent:');
}
