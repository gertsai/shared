/**
 * @gerts/core - Graph Store Interfaces Tests
 *
 * Tests for Interface Segregation Principle (ISP) compliance.
 * Verifies that:
 * 1. Each sub-interface is independently implementable
 * 2. Type guards correctly identify implementations
 * 3. Composed IGraphStore extends all sub-interfaces
 */

import { describe, it, expect } from 'vitest';
import type {
  IEntityStore,
  IRelationshipStore,
  IMentionStore,
  ITextUnitStore,
  ICommunityStore,
  IGraphStore,
  GraphEntity,
  Relationship,
  EntityMention,
  TextUnit,
  Community,
  GraphStats,
} from './stores';
import {
  isEntityStore,
  isRelationshipStore,
  isMentionStore,
  isTextUnitStore,
  isCommunityStore,
  isGraphStore,
} from './stores';

// ============================================================================
// Mock Implementations for Testing ISP
// ============================================================================

/**
 * Minimal IEntityStore implementation.
 * Demonstrates that clients can implement only entity operations.
 */
class MinimalEntityStore implements IEntityStore {
  private entities = new Map<string, GraphEntity>();

  async addEntity(entity: GraphEntity): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  async addEntities(entities: GraphEntity[]): Promise<void> {
    for (const entity of entities) {
      await this.addEntity(entity);
    }
  }

  async getEntity(id: string, tenantId?: string): Promise<GraphEntity | null> {
    const entity = this.entities.get(id);
    if (!entity) return null;
    if (tenantId && entity.tenantId !== tenantId) return null;
    return entity;
  }

  async getEntities(ids: string[], tenantId?: string): Promise<GraphEntity[]> {
    const results: GraphEntity[] = [];
    for (const id of ids) {
      const entity = await this.getEntity(id, tenantId);
      if (entity) results.push(entity);
    }
    return results;
  }

  async updateEntity(id: string, updates: Partial<GraphEntity>, tenantId: string): Promise<void> {
    const entity = await this.getEntity(id, tenantId);
    if (!entity) throw new Error(`Entity not found: ${id}`);
    this.entities.set(id, { ...entity, ...updates });
  }

  async deleteEntity(id: string, tenantId: string): Promise<boolean> {
    const entity = await this.getEntity(id, tenantId);
    if (!entity) return false;
    this.entities.delete(id);
    return true;
  }
}

/**
 * Minimal IRelationshipStore implementation.
 */
class MinimalRelationshipStore implements IRelationshipStore {
  private relationships = new Map<string, Relationship>();

  async addRelationship(relationship: Relationship): Promise<void> {
    this.relationships.set(relationship.id, relationship);
  }

  async addRelationships(relationships: Relationship[]): Promise<void> {
    for (const rel of relationships) {
      await this.addRelationship(rel);
    }
  }

  async getRelationship(id: string, tenantId?: string): Promise<Relationship | null> {
    const rel = this.relationships.get(id);
    if (!rel) return null;
    if (tenantId && rel.tenantId !== tenantId) return null;
    return rel;
  }

  async getRelationships(ids: string[], tenantId?: string): Promise<Relationship[]> {
    const results: Relationship[] = [];
    for (const id of ids) {
      const rel = await this.getRelationship(id, tenantId);
      if (rel) results.push(rel);
    }
    return results;
  }

  async getRelationshipsByEntity(entityId: string, tenantId: string): Promise<Relationship[]> {
    const results: Relationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.tenantId !== tenantId) continue;
      if (rel.sourceId === entityId || rel.targetId === entityId) {
        results.push(rel);
      }
    }
    return results;
  }
}

/**
 * Minimal IMentionStore implementation.
 */
class MinimalMentionStore implements IMentionStore {
  private mentions: EntityMention[] = [];

  async addEntityMention(mention: EntityMention): Promise<void> {
    this.mentions.push(mention);
  }

  async addEntityMentions(mentions: EntityMention[]): Promise<void> {
    this.mentions.push(...mentions);
  }

  async getChunksByEntity(
    entityId: string,
    tenantId: string
  ): Promise<TextUnit[]> {
    // Return empty array - just for interface compliance
    void entityId;
    void tenantId;
    return [];
  }

  async getEntityMentions(
    entityId: string,
    tenantId: string
  ): Promise<EntityMention[]> {
    return this.mentions.filter(
      (m) => m.entityId === entityId && m.tenantId === tenantId
    );
  }

  async countEntityMentions(entityId: string, tenantId: string): Promise<number> {
    return this.mentions.filter(
      (m) => m.entityId === entityId && m.tenantId === tenantId
    ).length;
  }
}

/**
 * Minimal ITextUnitStore implementation.
 */
class MinimalTextUnitStore implements ITextUnitStore {
  private textUnits = new Map<string, TextUnit>();

  async addTextUnit(textUnit: TextUnit): Promise<void> {
    this.textUnits.set(textUnit.id, textUnit);
  }

  async addTextUnits(textUnits: TextUnit[]): Promise<void> {
    for (const tu of textUnits) {
      await this.addTextUnit(tu);
    }
  }

  async getTextUnit(id: string, tenantId?: string): Promise<TextUnit | null> {
    const tu = this.textUnits.get(id);
    if (!tu) return null;
    if (tenantId && tu.tenantId !== tenantId) return null;
    return tu;
  }

  async getTextUnits(ids: string[], tenantId?: string): Promise<TextUnit[]> {
    const results: TextUnit[] = [];
    for (const id of ids) {
      const tu = await this.getTextUnit(id, tenantId);
      if (tu) results.push(tu);
    }
    return results;
  }
}

/**
 * Minimal ICommunityStore implementation.
 */
class MinimalCommunityStore implements ICommunityStore {
  private communities = new Map<string, Community>();

  async addCommunity(community: Community): Promise<void> {
    this.communities.set(community.id, community);
  }

  async getCommunities(tenantId: string): Promise<Community[]> {
    return [...this.communities.values()].filter((c) => c.tenantId === tenantId);
  }

  async getCommunity(id: string, tenantId?: string): Promise<Community | null> {
    const community = this.communities.get(id);
    if (!community) return null;
    if (tenantId && community.tenantId !== tenantId) return null;
    return community;
  }
}

/**
 * Full IGraphStore implementation.
 */
class FullGraphStore implements IGraphStore {
  private entityStore = new MinimalEntityStore();
  private relationshipStore = new MinimalRelationshipStore();
  private mentionStore = new MinimalMentionStore();
  private textUnitStore = new MinimalTextUnitStore();
  private communityStore = new MinimalCommunityStore();

  // IEntityStore
  addEntity = this.entityStore.addEntity.bind(this.entityStore);
  addEntities = this.entityStore.addEntities.bind(this.entityStore);
  getEntity = this.entityStore.getEntity.bind(this.entityStore);
  getEntities = this.entityStore.getEntities.bind(this.entityStore);
  updateEntity = this.entityStore.updateEntity.bind(this.entityStore);
  deleteEntity = this.entityStore.deleteEntity.bind(this.entityStore);

  // IRelationshipStore
  addRelationship = this.relationshipStore.addRelationship.bind(this.relationshipStore);
  addRelationships = this.relationshipStore.addRelationships.bind(this.relationshipStore);
  getRelationship = this.relationshipStore.getRelationship.bind(this.relationshipStore);
  getRelationships = this.relationshipStore.getRelationships.bind(this.relationshipStore);
  getRelationshipsByEntity = this.relationshipStore.getRelationshipsByEntity.bind(
    this.relationshipStore
  );

  // IMentionStore
  addEntityMention = this.mentionStore.addEntityMention.bind(this.mentionStore);
  addEntityMentions = this.mentionStore.addEntityMentions.bind(this.mentionStore);
  getChunksByEntity = this.mentionStore.getChunksByEntity.bind(this.mentionStore);
  getEntityMentions = this.mentionStore.getEntityMentions.bind(this.mentionStore);
  countEntityMentions = this.mentionStore.countEntityMentions.bind(this.mentionStore);

  // ITextUnitStore
  addTextUnit = this.textUnitStore.addTextUnit.bind(this.textUnitStore);
  addTextUnits = this.textUnitStore.addTextUnits.bind(this.textUnitStore);
  getTextUnit = this.textUnitStore.getTextUnit.bind(this.textUnitStore);
  getTextUnits = this.textUnitStore.getTextUnits.bind(this.textUnitStore);

  // ICommunityStore
  addCommunity = this.communityStore.addCommunity.bind(this.communityStore);
  getCommunities = this.communityStore.getCommunities.bind(this.communityStore);
  getCommunity = this.communityStore.getCommunity.bind(this.communityStore);

  // IGraphStore specific
  async clear(_tenantId: string): Promise<void> {
    // Clear implementation
  }

  async getStats(tenantId: string): Promise<GraphStats> {
    return {
      entityCount: 0,
      relationshipCount: 0,
      communityCount: (await this.getCommunities(tenantId)).length,
      textUnitCount: 0,
      mentionCount: 0,
    };
  }
}

// ============================================================================
// Test Data Helpers
// ============================================================================

function createTestEntity(id: string, tenantId: string): GraphEntity {
  return {
    id,
    name: `Entity ${id}`,
    normalizedName: `ENTITY ${id}`,
    type: 'PERSON',
    description: 'Test entity',
    communityIds: [],
    textUnitIds: [],
    rank: 0.5,
    degree: 0,
    tenantId,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createTestRelationship(
  id: string,
  sourceId: string,
  targetId: string,
  tenantId: string
): Relationship {
  return {
    id,
    sourceId,
    targetId,
    type: 'KNOWS',
    description: 'Test relationship',
    weight: 1,
    textUnitIds: [],
    createdAt: new Date(),
    tenantId,
    metadata: {},
  };
}

function createTestMention(entityId: string, chunkId: string, tenantId: string): EntityMention {
  return {
    entityId,
    chunkId,
    tenantId,
    confidence: 0.9,
    createdAt: new Date(),
    metadata: {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Interface Segregation Principle Compliance', () => {
  describe('IEntityStore', () => {
    it('should be implementable independently', async () => {
      const store = new MinimalEntityStore();
      const entity = createTestEntity('e1', 'tenant-1');

      await store.addEntity(entity);
      const retrieved = await store.getEntity('e1');

      expect(retrieved).toEqual(entity);
    });

    it('should pass type guard', () => {
      const store = new MinimalEntityStore();
      expect(isEntityStore(store)).toBe(true);
    });

    it('should not pass type guard for non-compliant object', () => {
      expect(isEntityStore({})).toBe(false);
      expect(isEntityStore(null)).toBe(false);
      expect(isEntityStore({ addEntity: 'not a function' })).toBe(false);
    });
  });

  describe('IRelationshipStore', () => {
    it('should be implementable independently', async () => {
      const store = new MinimalRelationshipStore();
      const rel = createTestRelationship('r1', 'e1', 'e2', 'tenant-1');

      await store.addRelationship(rel);
      const retrieved = await store.getRelationship('r1');

      expect(retrieved).toEqual(rel);
    });

    it('should pass type guard', () => {
      const store = new MinimalRelationshipStore();
      expect(isRelationshipStore(store)).toBe(true);
    });
  });

  describe('IMentionStore', () => {
    it('should be implementable independently', async () => {
      const store = new MinimalMentionStore();
      const mention = createTestMention('e1', 'chunk-1', 'tenant-1');

      await store.addEntityMention(mention);
      const count = await store.countEntityMentions('e1', 'tenant-1');

      expect(count).toBe(1);
    });

    it('should pass type guard', () => {
      const store = new MinimalMentionStore();
      expect(isMentionStore(store)).toBe(true);
    });
  });

  describe('ITextUnitStore', () => {
    it('should be implementable independently', async () => {
      const store = new MinimalTextUnitStore();
      const textUnit: TextUnit = {
        id: 'tu-1',
        text: 'Test text',
        tokenCount: 10,
        documentIds: [],
        entityIds: [],
        relationshipIds: [],
        tenantId: 'tenant-1',
        metadata: {},
        createdAt: new Date(),
      };

      await store.addTextUnit(textUnit);
      const retrieved = await store.getTextUnit('tu-1');

      expect(retrieved).toEqual(textUnit);
    });

    it('should pass type guard', () => {
      const store = new MinimalTextUnitStore();
      expect(isTextUnitStore(store)).toBe(true);
    });
  });

  describe('ICommunityStore', () => {
    it('should be implementable independently', async () => {
      const store = new MinimalCommunityStore();
      const community: Community = {
        id: 'c-1',
        level: 0,
        title: 'Test Community',
        summary: 'Test summary',
        entityIds: [],
        relationshipIds: [],
        childrenIds: [],
        size: 0,
        rank: 0.5,
        tenantId: 'tenant-1',
        createdAt: new Date(),
      };

      await store.addCommunity(community);
      const retrieved = await store.getCommunity('c-1');

      expect(retrieved).toEqual(community);
    });

    it('should pass type guard', () => {
      const store = new MinimalCommunityStore();
      expect(isCommunityStore(store)).toBe(true);
    });
  });

  describe('IGraphStore (Composed Interface)', () => {
    it('should compose all sub-interfaces', () => {
      const store = new FullGraphStore();

      // Verify all type guards pass
      expect(isEntityStore(store)).toBe(true);
      expect(isRelationshipStore(store)).toBe(true);
      expect(isMentionStore(store)).toBe(true);
      expect(isTextUnitStore(store)).toBe(true);
      expect(isCommunityStore(store)).toBe(true);
      expect(isGraphStore(store)).toBe(true);
    });

    it('should support entity operations', async () => {
      const store = new FullGraphStore();
      const entity = createTestEntity('e1', 'tenant-1');

      await store.addEntity(entity);
      const retrieved = await store.getEntity('e1');

      expect(retrieved).toEqual(entity);
    });

    it('should support relationship operations', async () => {
      const store = new FullGraphStore();
      const rel = createTestRelationship('r1', 'e1', 'e2', 'tenant-1');

      await store.addRelationship(rel);
      const retrieved = await store.getRelationship('r1');

      expect(retrieved).toEqual(rel);
    });

    it('should support getStats', async () => {
      const store = new FullGraphStore();
      const stats = await store.getStats('tenant-1');

      expect(stats).toHaveProperty('entityCount');
      expect(stats).toHaveProperty('relationshipCount');
      expect(stats).toHaveProperty('communityCount');
      expect(stats).toHaveProperty('textUnitCount');
      expect(stats).toHaveProperty('mentionCount');
    });
  });
});
