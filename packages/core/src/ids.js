"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExecutionId = exports.createFlowId = exports.createSessionId = exports.createTaskId = exports.createAgentId = exports.createUserId = exports.createTenantId = void 0;
exports.toId = toId;
exports.createId = createId;
exports.isTenantId = isTenantId;
exports.isUserId = isUserId;
exports.isAgentId = isAgentId;
function toId(value) {
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
function createId(prefix, value) {
    return `${prefix}:${value ?? createRandomValue()}`;
}
// Type-safe ID creators
const createTenantId = (value) => createId('tenant', value);
exports.createTenantId = createTenantId;
const createUserId = (value) => createId('user', value);
exports.createUserId = createUserId;
const createAgentId = (value) => createId('agent', value);
exports.createAgentId = createAgentId;
const createTaskId = (value) => createId('task', value);
exports.createTaskId = createTaskId;
const createSessionId = (value) => createId('session', value);
exports.createSessionId = createSessionId;
const createFlowId = (value) => createId('flow', value);
exports.createFlowId = createFlowId;
const createExecutionId = (value) => createId('execution', value);
exports.createExecutionId = createExecutionId;
// Type guards for branded IDs
function isTenantId(id) {
    return id.startsWith('tenant:');
}
function isUserId(id) {
    return id.startsWith('user:');
}
function isAgentId(id) {
    return id.startsWith('agent:');
}
//# sourceMappingURL=ids.js.map