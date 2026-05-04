import { describe, expect, it } from 'vitest';
import {
  GertsConnectionTypes,
  GertsConnectionType,
  CONNECTION_COMPATIBILITY,
  validateConnection,
  isAiConnectionType,
  isGraphConnectionType,
  getAcceptedConnectionTypes,
  getCompatibleTargets,
} from './connections';

describe('GertsConnectionTypes', () => {
  it('should have 28 connection types', () => {
    const types = Object.keys(GertsConnectionTypes);
    expect(types.length).toBe(28);
  });

  it('should have Main and Error as standard flow types', () => {
    expect(GertsConnectionTypes.Main).toBe('main');
    expect(GertsConnectionTypes.Error).toBe('error');
  });

  it('should have all AI component types', () => {
    expect(GertsConnectionTypes.AiAgent).toBe('ai_agent');
    expect(GertsConnectionTypes.AiLanguageModel).toBe('ai_languageModel');
    expect(GertsConnectionTypes.AiMemory).toBe('ai_memory');
    expect(GertsConnectionTypes.AiTool).toBe('ai_tool');
    expect(GertsConnectionTypes.AiEmbedding).toBe('ai_embedding');
    expect(GertsConnectionTypes.AiVectorStore).toBe('ai_vectorStore');
    expect(GertsConnectionTypes.AiRetriever).toBe('ai_retriever');
  });

  it('should have all Graph RAG specific types', () => {
    expect(GertsConnectionTypes.GraphStore).toBe('graph_store');
    expect(GertsConnectionTypes.EntityExtractor).toBe('entity_extractor');
    expect(GertsConnectionTypes.RelationExtractor).toBe('relation_extractor');
    expect(GertsConnectionTypes.Triplets).toBe('triplets');
    expect(GertsConnectionTypes.KnowledgeMemory).toBe('knowledge_memory');
  });
});

describe('CONNECTION_COMPATIBILITY', () => {
  it('should have compatibility rules for all connection types', () => {
    const allTypes = Object.values(GertsConnectionTypes);
    const rulesForTypes = Object.keys(CONNECTION_COMPATIBILITY);

    for (const type of allTypes) {
      expect(rulesForTypes).toContain(type);
    }
  });

  it('should define AiAgent as accepting model, memory, tools, retriever', () => {
    const accepted = CONNECTION_COMPATIBILITY[GertsConnectionTypes.AiAgent];
    expect(accepted).toContain(GertsConnectionTypes.AiLanguageModel);
    expect(accepted).toContain(GertsConnectionTypes.AiMemory);
    expect(accepted).toContain(GertsConnectionTypes.AiTool);
    expect(accepted).toContain(GertsConnectionTypes.AiRetriever);
  });

  it('should define AiRetriever as accepting vector store, graph store, reranker', () => {
    const accepted = CONNECTION_COMPATIBILITY[GertsConnectionTypes.AiRetriever];
    expect(accepted).toContain(GertsConnectionTypes.AiVectorStore);
    expect(accepted).toContain(GertsConnectionTypes.GraphStore);
    expect(accepted).toContain(GertsConnectionTypes.AiReranker);
  });

  it('should define GraphStore as accepting entity/relation extractors and triplets', () => {
    const accepted = CONNECTION_COMPATIBILITY[GertsConnectionTypes.GraphStore];
    expect(accepted).toContain(GertsConnectionTypes.EntityExtractor);
    expect(accepted).toContain(GertsConnectionTypes.RelationExtractor);
    expect(accepted).toContain(GertsConnectionTypes.Triplets);
  });
});

describe('validateConnection', () => {
  it('should validate Main connections as always valid', () => {
    const result = validateConnection(GertsConnectionTypes.Main, GertsConnectionTypes.AiAgent);
    expect(result.valid).toBe(true);
  });

  it('should validate Error connections as always valid', () => {
    const result = validateConnection(GertsConnectionTypes.Error, GertsConnectionTypes.AiAgent);
    expect(result.valid).toBe(true);
  });

  it('should validate compatible AI connections', () => {
    const result = validateConnection(
      GertsConnectionTypes.AiLanguageModel,
      GertsConnectionTypes.AiAgent
    );
    expect(result.valid).toBe(true);
  });

  it('should reject incompatible connections', () => {
    const result = validateConnection(
      GertsConnectionTypes.AiTool,
      GertsConnectionTypes.AiVectorStore
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not accept');
  });

  it('should reject connections to leaf nodes', () => {
    const result = validateConnection(
      GertsConnectionTypes.AiAgent,
      GertsConnectionTypes.AiLanguageModel
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not accept any inputs');
  });

  it('should validate Graph RAG connections', () => {
    const result = validateConnection(
      GertsConnectionTypes.EntityExtractor,
      GertsConnectionTypes.GraphStore
    );
    expect(result.valid).toBe(true);
  });

  it('should validate embedding to vector store connection', () => {
    const result = validateConnection(
      GertsConnectionTypes.AiEmbedding,
      GertsConnectionTypes.AiVectorStore
    );
    expect(result.valid).toBe(true);
  });
});

describe('isAiConnectionType', () => {
  it('should return true for AI types', () => {
    expect(isAiConnectionType(GertsConnectionTypes.AiAgent)).toBe(true);
    expect(isAiConnectionType(GertsConnectionTypes.AiLanguageModel)).toBe(true);
    expect(isAiConnectionType(GertsConnectionTypes.AiTool)).toBe(true);
  });

  it('should return false for non-AI types', () => {
    expect(isAiConnectionType(GertsConnectionTypes.Main)).toBe(false);
    expect(isAiConnectionType(GertsConnectionTypes.GraphStore)).toBe(false);
    expect(isAiConnectionType(GertsConnectionTypes.EntityExtractor)).toBe(false);
  });
});

describe('isGraphConnectionType', () => {
  it('should return true for Graph RAG types', () => {
    expect(isGraphConnectionType(GertsConnectionTypes.GraphStore)).toBe(true);
    expect(isGraphConnectionType(GertsConnectionTypes.EntityExtractor)).toBe(true);
    expect(isGraphConnectionType(GertsConnectionTypes.RelationExtractor)).toBe(true);
    expect(isGraphConnectionType(GertsConnectionTypes.KnowledgeMemory)).toBe(true);
  });

  it('should return false for non-Graph types', () => {
    expect(isGraphConnectionType(GertsConnectionTypes.Main)).toBe(false);
    expect(isGraphConnectionType(GertsConnectionTypes.AiAgent)).toBe(false);
  });
});

describe('getAcceptedConnectionTypes', () => {
  it('should return accepted types for AiAgent', () => {
    const accepted = getAcceptedConnectionTypes(GertsConnectionTypes.AiAgent);
    expect(accepted.length).toBe(4);
    expect(accepted).toContain(GertsConnectionTypes.AiLanguageModel);
  });

  it('should return empty array for leaf nodes', () => {
    const accepted = getAcceptedConnectionTypes(GertsConnectionTypes.AiLanguageModel);
    expect(accepted.length).toBe(0);
  });
});

describe('getCompatibleTargets', () => {
  it('should find all targets that accept AiLanguageModel', () => {
    const targets = getCompatibleTargets(GertsConnectionTypes.AiLanguageModel);
    expect(targets).toContain(GertsConnectionTypes.AiAgent);
    expect(targets).toContain(GertsConnectionTypes.AiChain);
    expect(targets).toContain(GertsConnectionTypes.EntityExtractor);
    expect(targets).toContain(GertsConnectionTypes.RelationExtractor);
  });

  it('should find targets that accept AiEmbedding', () => {
    const targets = getCompatibleTargets(GertsConnectionTypes.AiEmbedding);
    expect(targets).toContain(GertsConnectionTypes.AiVectorStore);
    expect(targets).toContain(GertsConnectionTypes.Embeddings);
  });
});
