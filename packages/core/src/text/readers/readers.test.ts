import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { TextFileReader } from './text';
import { MarkdownReader } from './markdown';
import { JSONReader } from './json';
import { CSVReader } from './csv';
import { HTMLReader } from './html';
import { ReaderRegistry } from './registry';

describe('TextFileReader', () => {
  const testDir = join(tmpdir(), 'gerts-text-reader-test');
  const testFile = join(testDir, 'sample.txt');
  const testContent = 'Hello, World!\nThis is a test file.';

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, testContent, 'utf-8');
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('has correct supported extensions', () => {
    const reader = new TextFileReader();
    expect(reader.supportedExtensions).toContain('.txt');
  });

  it('canRead returns true for .txt files', () => {
    const reader = new TextFileReader();
    expect(reader.canRead('/path/to/file.txt')).toBe(true);
    expect(reader.canRead('/path/to/file.TXT')).toBe(true);
    expect(reader.canRead('/path/to/file.md')).toBe(false);
  });

  it('loads text file and creates Document with correct metadata', async () => {
    const reader = new TextFileReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe(testContent);
    expect(docs[0].id).toMatch(/^doc:/);
    expect(docs[0].metadata.file_path).toBe(testFile);
    expect(docs[0].metadata.file_name).toBe('sample.txt');
    expect(docs[0].metadata.file_type).toBe('text/plain');
    expect(docs[0].metadata.source_type).toBe('file');
    expect(docs[0].metadata.file_size).toBe(testContent.length);
    expect(docs[0].metadata.created_at).toBeDefined();
    expect(docs[0].metadata.modified_at).toBeDefined();
  });
});

describe('MarkdownReader', () => {
  const testDir = join(tmpdir(), 'gerts-markdown-reader-test');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('has correct supported extensions', () => {
    const reader = new MarkdownReader();
    expect(reader.supportedExtensions).toContain('.md');
    expect(reader.supportedExtensions).toContain('.markdown');
  });

  it('canRead returns true for markdown files', () => {
    const reader = new MarkdownReader();
    expect(reader.canRead('/path/to/file.md')).toBe(true);
    expect(reader.canRead('/path/to/file.MD')).toBe(true);
    expect(reader.canRead('/path/to/file.markdown')).toBe(true);
    expect(reader.canRead('/path/to/file.txt')).toBe(false);
  });

  it('loads markdown file without frontmatter', async () => {
    const testFile = join(testDir, 'simple.md');
    const content = '# Hello World\n\nThis is a test.';
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe(content);
    expect(docs[0].metadata.file_type).toBe('text/markdown');
    expect(docs[0].metadata.extra).toBeDefined();
    expect((docs[0].metadata.extra as Record<string, string>).title).toBe('Hello World');
  });

  it('extracts YAML frontmatter correctly', async () => {
    const testFile = join(testDir, 'with-frontmatter.md');
    const content = `---
title: My Document
author: Test Author
date: 2024-01-01
---

# Content Here

Body text.`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe('# Content Here\n\nBody text.');

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBe('My Document');
    expect(extra.author).toBe('Test Author');
    expect(extra.date).toBe('2024-01-01');
  });

  it('handles frontmatter with quoted values', async () => {
    const testFile = join(testDir, 'quoted-frontmatter.md');
    const content = `---
title: "Quoted Title"
description: 'Single quoted'
---

Content`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBe('Quoted Title');
    expect(extra.description).toBe('Single quoted');
  });

  it('extracts title from first H1 when no frontmatter title', async () => {
    const testFile = join(testDir, 'h1-title.md');
    const content = `Some intro text

# Main Title

Body content here.`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBe('Main Title');
  });

  it('prefers frontmatter title over H1', async () => {
    const testFile = join(testDir, 'frontmatter-vs-h1.md');
    const content = `---
title: Frontmatter Title
---

# H1 Title

Content`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBe('Frontmatter Title');
  });

  it('handles empty frontmatter', async () => {
    const testFile = join(testDir, 'empty-frontmatter.md');
    const content = `---
---

# Content`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new MarkdownReader();
    const docs = await reader.loadData(testFile);

    expect(docs[0].text).toBe('# Content');
  });
});

describe('ReaderRegistry with FileReaders', () => {
  it('registers FileReader using registerFileReader', () => {
    const registry = new ReaderRegistry();
    const textReader = new TextFileReader();
    const mdReader = new MarkdownReader();

    registry.registerFileReader(textReader);
    registry.registerFileReader(mdReader);

    expect(registry.getReaderForExtension('.txt')).toBe(textReader);
    expect(registry.getReaderForExtension('.md')).toBe(mdReader);
    expect(registry.getReaderForExtension('.markdown')).toBe(mdReader);
    expect(registry.size).toBe(2);
  });

  it('creates default registry with all readers', () => {
    const registry = new ReaderRegistry();
    const textReader = new TextFileReader();
    const mdReader = new MarkdownReader();

    registry.registerFileReader(textReader);
    registry.registerFileReader(mdReader);

    // Check path-based lookup
    expect(registry.getReaderForPath('/docs/readme.md')).toBe(mdReader);
    expect(registry.getReaderForPath('/data/notes.txt')).toBe(textReader);

    // List all extensions
    const extensions = registry.listExtensions();
    expect(extensions).toContain('.txt');
    expect(extensions).toContain('.md');
    expect(extensions).toContain('.markdown');
  });
});

describe('HTMLReader', () => {
  const testDir = join(tmpdir(), 'gerts-html-reader-test');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('has correct supported extensions', () => {
    const reader = new HTMLReader();
    expect(reader.supportedExtensions).toContain('.html');
    expect(reader.supportedExtensions).toContain('.htm');
  });

  it('canRead returns true for HTML files', () => {
    const reader = new HTMLReader();
    expect(reader.canRead('/path/to/file.html')).toBe(true);
    expect(reader.canRead('/path/to/file.HTML')).toBe(true);
    expect(reader.canRead('/path/to/file.htm')).toBe(true);
    expect(reader.canRead('/path/to/file.txt')).toBe(false);
  });

  it('strips HTML tags and extracts plain text', async () => {
    const testFile = join(testDir, 'simple.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a paragraph.</p>
  <div>Another section</div>
</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain('Hello World');
    expect(docs[0].text).toContain('This is a paragraph.');
    expect(docs[0].text).toContain('Another section');
    expect(docs[0].text).not.toContain('<h1>');
    expect(docs[0].text).not.toContain('<p>');
    expect(docs[0].metadata.file_type).toBe('text/html');
  });

  it('extracts title from <title> tag', async () => {
    const testFile = join(testDir, 'with-title.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <title>My Document Title</title>
</head>
<body>Content</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBe('My Document Title');
  });

  it('does not extract title when extractTitle is false', async () => {
    const testFile = join(testDir, 'no-title.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <title>Should Not Extract</title>
</head>
<body>Content</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader({ extractTitle: false });
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.title).toBeUndefined();
  });

  it('extracts meta tags', async () => {
    const testFile = join(testDir, 'with-meta.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="Test description">
  <meta property="og:title" content="OG Title">
  <meta name="keywords" content="test, html, reader">
</head>
<body>Content</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.description).toBe('Test description');
    expect(extra['og:title']).toBe('OG Title');
    expect(extra.keywords).toBe('test, html, reader');
  });

  it('does not extract meta tags when extractMeta is false', async () => {
    const testFile = join(testDir, 'no-meta.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="Should not extract">
</head>
<body>Content</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader({ extractMeta: false });
    const docs = await reader.loadData(testFile);

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.description).toBeUndefined();
  });

  it('preserves links when preserveLinks is true', async () => {
    const testFile = join(testDir, 'with-links.html');
    const content = `<!DOCTYPE html>
<html>
<body>
  <p>Check out <a href="https://example.com">this link</a> for more info.</p>
</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader({ preserveLinks: true });
    const docs = await reader.loadData(testFile);

    expect(docs[0].text).toContain('[this link](https://example.com)');
  });

  it('removes script and style elements', async () => {
    const testFile = join(testDir, 'with-script.html');
    const content = `<!DOCTYPE html>
<html>
<head>
  <style>body { color: red; }</style>
</head>
<body>
  <p>Visible content</p>
  <script>console.log('hidden');</script>
</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    expect(docs[0].text).toContain('Visible content');
    expect(docs[0].text).not.toContain('color: red');
    expect(docs[0].text).not.toContain('console.log');
  });

  it('decodes HTML entities', async () => {
    const testFile = join(testDir, 'with-entities.html');
    const content = `<!DOCTYPE html>
<html>
<body>
  <p>Testing &amp; entities: &lt;tag&gt; &quot;quotes&quot; &copy; &mdash;</p>
</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    expect(docs[0].text).toContain('Testing & entities');
    expect(docs[0].text).toContain('<tag>');
    expect(docs[0].text).toContain('"quotes"');
    expect(docs[0].text).toContain('©');
    expect(docs[0].text).toContain('—');
  });

  it('converts block elements to newlines', async () => {
    const testFile = join(testDir, 'with-blocks.html');
    const content = `<!DOCTYPE html>
<html>
<body>
  <p>Paragraph 1</p>
  <p>Paragraph 2</p>
  <div>Division</div>
  Line 1<br>Line 2
</body>
</html>`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    // Check that content is separated by newlines
    expect(docs[0].text).toContain('Paragraph 1');
    expect(docs[0].text).toContain('Paragraph 2');
    expect(docs[0].text).toContain('Division');
    expect(docs[0].text).toContain('Line 1');
    expect(docs[0].text).toContain('Line 2');
  });

  it('handles metadata with file info', async () => {
    const testFile = join(testDir, 'metadata.html');
    const content = '<html><body>Test</body></html>';
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new HTMLReader();
    const docs = await reader.loadData(testFile);

    expect(docs[0].metadata.file_path).toBe(testFile);
    expect(docs[0].metadata.file_name).toBe('metadata.html');
    expect(docs[0].metadata.file_type).toBe('text/html');
    expect(docs[0].metadata.source_type).toBe('file');
    expect(docs[0].metadata.file_size).toBeDefined();
    expect(docs[0].metadata.created_at).toBeDefined();
    expect(docs[0].metadata.modified_at).toBeDefined();
  });
});

describe('CSVReader', () => {
  const testDir = join(tmpdir(), 'gerts-csv-reader-test');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('has correct supported extensions', () => {
    const reader = new CSVReader();
    expect(reader.supportedExtensions).toContain('.csv');
    expect(reader.supportedExtensions).toContain('.tsv');
  });

  it('canRead returns true for CSV and TSV files', () => {
    const reader = new CSVReader();
    expect(reader.canRead('/path/to/file.csv')).toBe(true);
    expect(reader.canRead('/path/to/file.CSV')).toBe(true);
    expect(reader.canRead('/path/to/file.tsv')).toBe(true);
    expect(reader.canRead('/path/to/file.TSV')).toBe(true);
    expect(reader.canRead('/path/to/file.txt')).toBe(false);
  });

  it('parses simple CSV with headers', async () => {
    const testFile = join(testDir, 'simple.csv');
    const content = `name,age,city
Alice,30,NYC
Bob,25,LA
Charlie,35,Chicago`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(3);
    expect(docs[0].text).toContain('Alice');
    expect(docs[0].text).toContain('30');
    expect(docs[0].text).toContain('NYC');
    expect(docs[0].metadata.file_type).toBe('text/csv');
    expect(docs[0].metadata.extra?.row_index).toBe(0);
    expect(docs[1].metadata.extra?.row_index).toBe(1);
  });

  it('parses TSV with tab delimiter', async () => {
    const testFile = join(testDir, 'data.tsv');
    const content = `name\tage\tcity
Alice\t30\tNYC
Bob\t25\tLA`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Alice');
    expect(docs[0].text).toContain('30');
  });

  it('handles quoted fields with embedded delimiters', async () => {
    const testFile = join(testDir, 'quoted.csv');
    const content = `name,description,value
Alice,"Description with, comma",100
Bob,"Multi-line
description",200`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Description with, comma');
    expect(docs[1].text).toContain('Multi-line\ndescription');
  });

  it('handles escaped quotes in quoted fields', async () => {
    const testFile = join(testDir, 'escaped-quotes.csv');
    const content = `name,quote
Alice,"She said ""Hello"""
Bob,"It""s working"`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('She said "Hello"');
    expect(docs[1].text).toContain('It"s working');
  });

  it('supports hasHeader option set to false', async () => {
    const testFile = join(testDir, 'no-header.csv');
    const content = `Alice,30,NYC
Bob,25,LA`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader({ hasHeader: false });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    // When no header, columns are named col_0, col_1, etc.
    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.col_0).toBe('Alice');
    expect(extra.col_1).toBe('30');
    expect(extra.col_2).toBe('NYC');
  });

  it('supports contentColumns option with column names', async () => {
    const testFile = join(testDir, 'content-cols.csv');
    const content = `id,name,age,description
1,Alice,30,Software Engineer
2,Bob,25,Designer`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader({ contentColumns: ['name', 'description'] });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Alice');
    expect(docs[0].text).toContain('Software Engineer');
    expect(docs[0].text).not.toContain('30'); // age not in content
  });

  it('supports contentColumns option with column indices', async () => {
    const testFile = join(testDir, 'content-indices.csv');
    const content = `id,name,age,city
1,Alice,30,NYC
2,Bob,25,LA`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader({ contentColumns: [1, 3] }); // name and city
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Alice');
    expect(docs[0].text).toContain('NYC');
    expect(docs[0].text).not.toContain('30');
  });

  it('supports metadataColumns option', async () => {
    const testFile = join(testDir, 'metadata-cols.csv');
    const content = `id,name,age,city,description
1,Alice,30,NYC,Software Engineer
2,Bob,25,LA,Designer`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader({
      contentColumns: ['description'],
      metadataColumns: ['id', 'name', 'city'],
    });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('Software Engineer');

    const extra = docs[0].metadata.extra as Record<string, string>;
    expect(extra.id).toBe('1');
    expect(extra.name).toBe('Alice');
    expect(extra.city).toBe('NYC');
    expect(extra.age).toBeUndefined(); // age not in metadataColumns
  });

  it('supports explicit delimiter option', async () => {
    const testFile = join(testDir, 'pipe-delimited.csv');
    const content = `name|age|city
Alice|30|NYC
Bob|25|LA`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader({ delimiter: '|' });
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Alice');
    expect(docs[0].text).toContain('30');
  });

  it('handles empty rows gracefully', async () => {
    const testFile = join(testDir, 'empty-rows.csv');
    const content = `name,age,city
Alice,30,NYC

Bob,25,LA

`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2); // Empty rows ignored
  });

  it('handles CRLF line endings', async () => {
    const testFile = join(testDir, 'crlf.csv');
    const content = `name,age\r\nAlice,30\r\nBob,25\r\n`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toContain('Alice');
  });

  it('returns empty array for empty file', async () => {
    const testFile = join(testDir, 'empty.csv');
    await fs.writeFile(testFile, '', 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs).toHaveLength(0);
  });

  it('includes all metadata fields correctly', async () => {
    const testFile = join(testDir, 'metadata.csv');
    const content = `name,value
Test,123`;
    await fs.writeFile(testFile, content, 'utf-8');

    const reader = new CSVReader();
    const docs = await reader.loadData(testFile);

    expect(docs[0].id).toMatch(/^doc:/);
    expect(docs[0].metadata.file_path).toBe(testFile);
    expect(docs[0].metadata.file_name).toBe('metadata.csv');
    expect(docs[0].metadata.file_type).toBe('text/csv');
    expect(docs[0].metadata.source_type).toBe('file');
    expect(docs[0].metadata.file_size).toBeGreaterThan(0);
    expect(docs[0].metadata.created_at).toBeDefined();
    expect(docs[0].metadata.modified_at).toBeDefined();
  });
});
