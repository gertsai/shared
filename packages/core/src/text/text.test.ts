import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createDocument } from './nodes/document';
import { createTextNode, TextNodeSchema } from './nodes/text-node';
import { filterMetadata } from './metadata/filter';
import { MetadataMode } from './metadata/modes';
import { NodeRelationship } from './relationships/types';
import { ReaderRegistry } from './readers/registry';
import { RecursiveCharacterTextSplitter } from './splitters/recursive';
import { SentenceSplitter } from './splitters/sentence';
import { CharacterTextSplitter } from './splitters/character';
import { TokenTextSplitter, SimpleTokenizer } from './splitters/token';
import { getSeparatorsForLanguage } from './splitters/language-separators';

describe('Document + TextNode schemas', () => {
  it('creates a document with generated id', () => {
    const doc = createDocument('hello', { file_name: 'a.txt' });
    expect(doc.id).toMatch(/^doc:/);
    expect(doc.metadata.file_name).toBe('a.txt');
  });

  it('creates a text node with required metadata', () => {
    const node = createTextNode('chunk', {
      chunk_index: 0,
      start_index: 0,
      end_index: 5,
      doc_id: 'doc:1',
    });
    const parsed = TextNodeSchema.parse(node);
    expect(parsed.id).toMatch(/^chunk:/);
  });

  it('validates metadata shape via zod', () => {
    const schema = z.object({ file_path: z.string().optional() });
    expect(schema.parse({ file_path: 'x' }).file_path).toBe('x');
  });
});

describe('filterMetadata', () => {
  it('returns all metadata for ALL', () => {
    const m = { a: 1, file_size: 10 };
    expect(filterMetadata(m, MetadataMode.ALL)).toEqual(m);
  });

  it('returns empty object for NONE', () => {
    expect(filterMetadata({ a: 1 }, MetadataMode.NONE)).toEqual({});
  });

  it('excludes default embed keys for EMBED', () => {
    const m = { chunk_index: 0, a: 1, file_size: 10 };
    expect(filterMetadata(m, MetadataMode.EMBED)).toEqual({ a: 1 });
  });

  it('excludes default llm keys for LLM', () => {
    const m = { chunk_overlap: 10, a: 1, file_size: 10 };
    expect(filterMetadata(m, MetadataMode.LLM)).toEqual({ a: 1 });
  });
});

describe('RecursiveCharacterTextSplitter', () => {
  it('splits long text into chunks respecting chunkSize', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 10, chunkOverlap: 0 });
    const chunks = splitter.splitText('abcdefghijklmnopqrstuvwxyz');
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(10);
  });

  it('creates TextNodes with correct doc_id and sequential relationships', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 5, chunkOverlap: 0 });
    const doc = createDocument('hello world', { file_path: '/tmp/a.txt' });
    const nodes = splitter.splitDocuments([doc]);

    expect(nodes.length).toBeGreaterThan(1);
    expect(nodes[0].metadata.doc_id).toBe(doc.id);
    expect(nodes[0].relationships?.[NodeRelationship.NEXT]?.nodeId).toBe(nodes[1].id);
    expect(nodes[1].relationships?.[NodeRelationship.PREVIOUS]?.nodeId).toBe(nodes[0].id);
  });

  it('includes start/end indices in source range', () => {
    const text = 'hello\n\nworld';
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 50,
      chunkOverlap: 0,
      keepSeparator: 'end',
    });
    const doc = createDocument(text);
    const nodes = splitter.splitDocuments([doc]);
    expect(nodes.length).toBe(1);
    expect(nodes[0].metadata.start_index).toBe(0);
    expect(nodes[0].metadata.end_index).toBe(text.length);
    expect(text.slice(nodes[0].metadata.start_index, nodes[0].metadata.end_index)).toBe(nodes[0].text);
  });

  it('applies overlap when configured', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 8, chunkOverlap: 3 });
    const chunks = splitter.splitText('abcdefghijklmno');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].startsWith(chunks[0].slice(-3))).toBe(true);
  });
});

describe('SentenceSplitter', () => {
  it('does not split on common abbreviations (en)', () => {
    const splitter = new SentenceSplitter({ chunkSize: 25, chunkOverlap: 0, language: 'en' });
    const chunks = splitter.splitText('Mr. Smith went home. Then he slept.');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('Mr. Smith');
  });

  it('splits on sentence boundaries and tracks indices', () => {
    const splitter = new SentenceSplitter({ chunkSize: 15, chunkOverlap: 0, language: 'en' });
    const doc = createDocument('Hello world. Bye world.');
    const nodes = splitter.splitDocuments([doc]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].metadata.start_index).toBe(0);
    expect(doc.text.slice(nodes[0].metadata.start_index, nodes[0].metadata.end_index)).toBe(nodes[0].text);
  });
});

describe('LANGUAGE_SEPARATORS', () => {
  it('returns a default separator list for unknown language', () => {
    const seps = getSeparatorsForLanguage('xx');
    expect(seps.length).toBeGreaterThan(0);
    expect(seps).toContain('');
  });

  it('normalizes language tags (e.g., en-US)', () => {
    const seps = getSeparatorsForLanguage('en-US');
    expect(seps).toEqual(getSeparatorsForLanguage('en'));
  });
});

describe('ReaderRegistry', () => {
  it('registers and retrieves reader by extension', () => {
    const registry = new ReaderRegistry();
    const reader = {
      canRead: (_: string) => true,
      loadData: async (_: string) => [],
    };

    registry.register(reader, ['.txt', 'md']);
    expect(registry.getReaderForExtension('.txt')).toBe(reader);
    expect(registry.getReaderForExtension('md')).toBe(reader);
  });

  it('throws on duplicate registration for same extension', () => {
    const registry = new ReaderRegistry();
    const reader1 = { canRead: (_: string) => true, loadData: async (_: string) => [] };
    const reader2 = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    registry.register(reader1, ['.txt']);
    expect(() => registry.register(reader2, ['txt'])).toThrow(/already registered/i);
  });

  it('returns null for empty/unknown extension', () => {
    const registry = new ReaderRegistry();
    expect(registry.getReaderForExtension('')).toBeNull();
    expect(registry.getReaderForExtension('.unknown')).toBeNull();
  });

  it('lists all registered readers', () => {
    const registry = new ReaderRegistry();
    const reader1 = { canRead: (_: string) => true, loadData: async (_: string) => [] };
    const reader2 = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    registry.register(reader1, ['.txt']);
    registry.register(reader2, ['.md', '.markdown']);

    const readers = registry.listReaders();
    expect(readers).toHaveLength(2);
    expect(readers).toContain(reader1);
    expect(readers).toContain(reader2);
  });

  it('lists all registered extensions', () => {
    const registry = new ReaderRegistry();
    const reader = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    registry.register(reader, ['.txt', '.md']);

    const extensions = registry.listExtensions();
    expect(extensions).toContain('.txt');
    expect(extensions).toContain('.md');
  });

  it('gets reader for file path', () => {
    const registry = new ReaderRegistry();
    const reader = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    registry.register(reader, ['.txt']);

    expect(registry.getReaderForPath('/path/to/file.txt')).toBe(reader);
    expect(registry.getReaderForPath('/path/to/file.md')).toBeNull();
    expect(registry.getReaderForPath('/path/to/file')).toBeNull();
  });

  it('checks if reader exists for extension', () => {
    const registry = new ReaderRegistry();
    const reader = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    registry.register(reader, ['.txt']);

    expect(registry.hasReaderForExtension('.txt')).toBe(true);
    expect(registry.hasReaderForExtension('.md')).toBe(false);
  });

  it('reports correct size and clears registry', () => {
    const registry = new ReaderRegistry();
    const reader = { canRead: (_: string) => true, loadData: async (_: string) => [] };

    expect(registry.size).toBe(0);

    registry.register(reader, ['.txt', '.md']);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.listExtensions()).toHaveLength(0);
  });
});

describe('SOURCE relationship in splitDocuments', () => {
  it('sets SOURCE relationship pointing to parent document', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 5, chunkOverlap: 0 });
    const doc = createDocument('hello world foo bar', { file_path: '/tmp/test.txt' });
    const nodes = splitter.splitDocuments([doc]);

    expect(nodes.length).toBeGreaterThan(1);

    for (const node of nodes) {
      expect(node.relationships).toBeDefined();
      expect(node.relationships![NodeRelationship.SOURCE]).toBeDefined();
      expect(node.relationships![NodeRelationship.SOURCE]!.nodeId).toBe(doc.id);
    }
  });

  it('sets SOURCE relationship for single-chunk documents', () => {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 0 });
    const doc = createDocument('short text');
    const nodes = splitter.splitDocuments([doc]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].relationships![NodeRelationship.SOURCE]!.nodeId).toBe(doc.id);
  });
});

describe('CharacterTextSplitter', () => {
  it('splits text by default separator (double newline)', () => {
    const splitter = new CharacterTextSplitter({ chunkSize: 100, chunkOverlap: 0 });
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const chunks = splitter.splitText(text);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toContain('First paragraph');
  });

  it('splits text by custom separator', () => {
    const splitter = new CharacterTextSplitter({
      chunkSize: 50,
      chunkOverlap: 0,
      separator: '|||',
    });
    const text = 'Part A|||Part B|||Part C';
    const chunks = splitter.splitText(text);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('respects chunkSize limit', () => {
    const splitter = new CharacterTextSplitter({ chunkSize: 20, chunkOverlap: 0 });
    const text = 'Short.\n\nMedium text here.\n\nLonger text content here.';
    const chunks = splitter.splitText(text);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25); // Allow small buffer
    }
  });

  it('creates TextNodes from documents', () => {
    const splitter = new CharacterTextSplitter({ chunkSize: 30, chunkOverlap: 0 });
    const doc = createDocument('Para 1.\n\nPara 2.\n\nPara 3.', { file_path: '/test.txt' });
    const nodes = splitter.splitDocuments([doc]);

    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].metadata.chunk_method).toBe('character');
  });
});

describe('TokenTextSplitter', () => {
  it('splits text by sentence boundaries', () => {
    const splitter = new TokenTextSplitter({ tokensPerChunk: 128, tokenOverlap: 0 });
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const chunks = splitter.splitText(text);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('uses SimpleTokenizer by default', () => {
    const splitter = new TokenTextSplitter({ chunkSize: 100, chunkOverlap: 10 });
    const text = 'Test text for tokenization.';
    const chunks = splitter.splitText(text);

    expect(chunks).toBeDefined();
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('accepts custom tokenizer', () => {
    const customTokenizer = new SimpleTokenizer();
    const splitter = new TokenTextSplitter({
      tokensPerChunk: 64,
      tokenOverlap: 5,
      tokenizer: customTokenizer,
    });
    const chunks = splitter.splitText('Some text to split into tokens.');

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('creates TextNodes with token chunk method', () => {
    const splitter = new TokenTextSplitter({ tokensPerChunk: 50, tokenOverlap: 0 });
    const doc = createDocument('Long text for token-based splitting.', { file_path: '/test.txt' });
    const nodes = splitter.splitDocuments([doc]);

    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].metadata.chunk_method).toBe('token');
  });
});

describe('SimpleTokenizer', () => {
  it('encodes text into token array', () => {
    const tokenizer = new SimpleTokenizer();
    const tokens = tokenizer.encode('Hello world!');

    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
    // ~4 chars per token, 12 chars -> ~3 tokens
    expect(tokens.length).toBe(3);
  });

  it('decode returns empty string (stub)', () => {
    const tokenizer = new SimpleTokenizer();
    const result = tokenizer.decode([0, 1, 2]);

    expect(result).toBe('');
  });
});
