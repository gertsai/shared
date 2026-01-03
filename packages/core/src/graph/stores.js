"use strict";
/**
 * @gerts/core - Graph Store Interfaces (Interface Segregation Principle)
 *
 * Split IGraphStore (~40 methods) into focused, single-responsibility interfaces.
 * Following ISP: clients should not be forced to depend on interfaces they don't use.
 *
 * This enables:
 * - Independent implementation of sub-interfaces
 * - Better testability with focused mocks
 * - Clearer API contracts for consumers
 * - Easier extension without breaking existing code
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEntityStore = isEntityStore;
exports.isRelationshipStore = isRelationshipStore;
exports.isMentionStore = isMentionStore;
exports.isTextUnitStore = isTextUnitStore;
exports.isCommunityStore = isCommunityStore;
exports.isGraphStore = isGraphStore;
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if an object implements IEntityStore.
 */
function isEntityStore(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        typeof obj.addEntity === 'function' &&
        typeof obj.addEntities === 'function' &&
        typeof obj.getEntity === 'function' &&
        typeof obj.getEntities === 'function' &&
        typeof obj.updateEntity === 'function' &&
        typeof obj.deleteEntity === 'function');
}
/**
 * Check if an object implements IRelationshipStore.
 */
function isRelationshipStore(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        typeof obj.addRelationship === 'function' &&
        typeof obj.addRelationships === 'function' &&
        typeof obj.getRelationship === 'function' &&
        typeof obj.getRelationships === 'function' &&
        typeof obj.getRelationshipsByEntity === 'function');
}
/**
 * Check if an object implements IMentionStore.
 */
function isMentionStore(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        typeof obj.addEntityMention === 'function' &&
        typeof obj.addEntityMentions === 'function' &&
        typeof obj.getChunksByEntity === 'function' &&
        typeof obj.getEntityMentions === 'function' &&
        typeof obj.countEntityMentions === 'function');
}
/**
 * Check if an object implements ITextUnitStore.
 */
function isTextUnitStore(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        typeof obj.addTextUnit === 'function' &&
        typeof obj.addTextUnits === 'function' &&
        typeof obj.getTextUnit === 'function' &&
        typeof obj.getTextUnits === 'function');
}
/**
 * Check if an object implements ICommunityStore.
 */
function isCommunityStore(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        typeof obj.addCommunity === 'function' &&
        typeof obj.getCommunities === 'function' &&
        typeof obj.getCommunity === 'function');
}
/**
 * Check if an object implements full IGraphStore.
 */
function isGraphStore(obj) {
    return (isEntityStore(obj) &&
        isRelationshipStore(obj) &&
        isMentionStore(obj) &&
        isTextUnitStore(obj) &&
        isCommunityStore(obj) &&
        typeof obj.clear === 'function' &&
        typeof obj.getStats === 'function');
}
//# sourceMappingURL=stores.js.map