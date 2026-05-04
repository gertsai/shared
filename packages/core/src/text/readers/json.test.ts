import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { JSONReader } from './json';

describe('JSONReader', () => {
  const testDir = join(tmpdir(), 'gerts-json-reader-test');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('has correct supported extensions', () => {
    const reader = new JSONReader();
    expect(reader.supportedExtensions).toContain('.json');
    expect(reader.supportedExtensions).toContain('.jsonl');
  });

  it('canRead returns true for JSON files', () => {
    const reader = new JSONReader();
    expect(reader.canRead('/path/to/file.json')).toBe(true);
    expect(reader.canRead('/path/to/file.JSON')).toBe(true);
    expect(reader.canRead('/path/to/file.jsonl')).toBe(true);
    expect(reader.canRead('/path/to/file.txt')).toBe(false);
  });

  it('loads single JSON object and stringifies it', async () => {
    const testFile = join(testDir, 'single.json');
    const data = { id: 1, title: 'Test Item', description: 'A test description' };
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe(JSON.stringify(data, null, 2));
    expect(docs[0].metadata.file_type).toBe('application/json');
    expect(docs[0].metadata.source_type).toBe('file');
    expect(docs[0].metadata.extra?.item_index).toBe(0);
    expect(docs[0].metadata.extra?.total_items).toBe(1);
  });

  it('loads JSON array and creates separate documents', async () => {
    const testFile = join(testDir, 'array.json');
    const data = [
      { id: 1, text: 'First item' },
      { id: 2, text: 'Second item' },
      { id: 3, text: 'Third item' },
    ];
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(3);
    expect(docs[0].metadata.extra?.item_index).toBe(0);
    expect(docs[1].metadata.extra?.item_index).toBe(1);
    expect(docs[2].metadata.extra?.item_index).toBe(2);
    expect(docs[0].metadata.extra?.total_items).toBe(3);
  });

  it('extracts content from specified contentField', async () => {
    const testFile = join(testDir, 'content-field.json');
    const data = [
      { id: 1, description: 'First description', metadata: 'meta1' },
      { id: 2, description: 'Second description', metadata: 'meta2' },
    ];
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader({ contentField: 'description' });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('First description');
    expect(docs[1].text).toBe('Second description');
  });

  it('extracts metadata fields into extra', async () => {
    const testFile = join(testDir, 'metadata-fields.json');
    const data = [
      { id: 1, title: 'Item 1', category: 'A', tags: ['tag1', 'tag2'], content: 'Content 1' },
      { id: 2, title: 'Item 2', category: 'B', tags: ['tag3'], content: 'Content 2' },
    ];
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader({
      contentField: 'content',
      metadataFields: ['id', 'title', 'category', 'tags'],
    });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('Content 1');
    expect(docs[0].metadata.extra?.id).toBe(1);
    expect(docs[0].metadata.extra?.title).toBe('Item 1');
    expect(docs[0].metadata.extra?.category).toBe('A');
    expect(docs[0].metadata.extra?.tags).toEqual(['tag1', 'tag2']);

    expect(docs[1].text).toBe('Content 2');
    expect(docs[1].metadata.extra?.id).toBe(2);
  });

  it('loads JSON Lines format (.jsonl)', async () => {
    const testFile = join(testDir, 'data.jsonl');
    const lines = [
      JSON.stringify({ id: 1, text: 'Line 1' }),
      JSON.stringify({ id: 2, text: 'Line 2' }),
      JSON.stringify({ id: 3, text: 'Line 3' }),
    ];
    await fs.writeFile(testFile, lines.join('\n'), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(3);
    expect(docs[0].metadata.file_type).toBe('application/x-ndjson');
    expect(docs[0].metadata.extra?.line_number).toBe(1);
    expect(docs[1].metadata.extra?.line_number).toBe(2);
    expect(docs[2].metadata.extra?.line_number).toBe(3);
    expect(docs[0].metadata.extra?.total_lines).toBe(3);
  });

  it('loads JSON Lines with contentField option', async () => {
    const testFile = join(testDir, 'content.jsonl');
    const lines = [
      JSON.stringify({ id: 1, message: 'First message', author: 'user1' }),
      JSON.stringify({ id: 2, message: 'Second message', author: 'user2' }),
    ];
    await fs.writeFile(testFile, lines.join('\n'), 'utf-8');

    const reader = new JSONReader({
      contentField: 'message',
      metadataFields: ['id', 'author'],
    });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('First message');
    expect(docs[0].metadata.extra?.id).toBe(1);
    expect(docs[0].metadata.extra?.author).toBe('user1');
    expect(docs[1].text).toBe('Second message');
  });

  it('handles empty lines in JSONL files', async () => {
    const testFile = join(testDir, 'empty-lines.jsonl');
    const lines = [
      JSON.stringify({ id: 1, text: 'Line 1' }),
      '',
      JSON.stringify({ id: 2, text: 'Line 2' }),
      '   ',
      JSON.stringify({ id: 3, text: 'Line 3' }),
    ];
    await fs.writeFile(testFile, lines.join('\n'), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(3);
    expect(docs[0].metadata.extra?.line_number).toBe(1);
    expect(docs[1].metadata.extra?.line_number).toBe(2);
    expect(docs[2].metadata.extra?.line_number).toBe(3);
  });

  it('handles missing contentField gracefully', async () => {
    const testFile = join(testDir, 'missing-field.json');
    const data = [
      { id: 1, title: 'Has no content field' },
      { id: 2, content: 'Has content field' },
    ];
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader({ contentField: 'content' });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('');
    expect(docs[1].text).toBe('Has content field');
  });

  it('handles non-object JSON values', async () => {
    const testFile = join(testDir, 'primitive.json');
    await fs.writeFile(testFile, JSON.stringify(['string1', 'string2', 123]), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(3);
    expect(docs[0].text).toBe('string1');
    expect(docs[1].text).toBe('string2');
    expect(docs[2].text).toBe('123');
  });

  it('uses isJsonLines option to force JSONL parsing', async () => {
    const testFile = join(testDir, 'forced-jsonl.json');
    const lines = [
      JSON.stringify({ id: 1, text: 'Line 1' }),
      JSON.stringify({ id: 2, text: 'Line 2' }),
    ];
    await fs.writeFile(testFile, lines.join('\n'), 'utf-8');

    const reader = new JSONReader({ isJsonLines: true });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].metadata.file_type).toBe('application/x-ndjson');
    expect(docs[0].metadata.extra?.line_number).toBe(1);
  });

  it('includes file metadata in all documents', async () => {
    const testFile = join(testDir, 'metadata-check.json');
    const data = { id: 1, text: 'Test' };
    await fs.writeFile(testFile, JSON.stringify(data), 'utf-8');

    const reader = new JSONReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.file_path).toBe(testFile);
    expect(docs[0].metadata.file_name).toBe('metadata-check.json');
    expect(docs[0].metadata.file_size).toBeGreaterThan(0);
    expect(docs[0].metadata.created_at).toBeDefined();
    expect(docs[0].metadata.modified_at).toBeDefined();
  });
});
