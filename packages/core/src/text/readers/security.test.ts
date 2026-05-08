/**
 * Security tests for SEC-001, SEC-002, SEC-003 fixes.
 *
 * These tests verify:
 * - SEC-001: File size limits are enforced by readers (REAL integration tests)
 * - SEC-002: Path traversal is prevented in DirectoryReader (REAL filesystem tests)
 * - SEC-003: ReDoS protection in TokenTextSplitter (Performance + functional)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  TextFileReader,
  MarkdownReader,
  JSONReader,
  CSVReader,
  HTMLReader,
  FileSizeExceededError,
  DEFAULT_MAX_FILE_SIZE,
} from './index';
import { DirectoryReader, PathTraversalError } from './directory';
import { TokenTextSplitter } from '../splitters/token';

// Dynamic import for fs to work with ESM
const getFs = async () => import('fs/promises');

describe('SEC-001: File Size Limits', () => {
  let testDir: string;
  let fs: Awaited<ReturnType<typeof getFs>>;

  beforeEach(async () => {
    fs = await getFs();
    testDir = join(tmpdir(), `sec-001-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('FileSizeExceededError', () => {
    it('should create error with correct properties', () => {
      const error = new FileSizeExceededError('/path/to/file.txt', 100_000_000, 50_000_000);

      expect(error.name).toBe('FileSizeExceededError');
      expect(error.filePath).toBe('/path/to/file.txt');
      expect(error.fileSize).toBe(100_000_000);
      expect(error.maxSize).toBe(50_000_000);
      expect(error.message).toContain('exceeds maximum');
    });
  });

  describe('DEFAULT_MAX_FILE_SIZE', () => {
    it('should be 50MB', () => {
      expect(DEFAULT_MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });
  });

  describe('TextFileReader', () => {
    it('should use default max file size', () => {
      const reader = new TextFileReader();
      expect(reader['maxFileSize']).toBe(DEFAULT_MAX_FILE_SIZE);
    });

    it('should accept custom max file size', () => {
      const reader = new TextFileReader({ maxFileSize: 1024 });
      expect(reader['maxFileSize']).toBe(1024);
    });

    // REAL INTEGRATION TEST: Actually read file and verify error is thrown
    it('should throw FileSizeExceededError when file exceeds limit', async () => {
      const largeFile = join(testDir, 'large.txt');
      const content = 'x'.repeat(2000); // 2000 bytes
      await fs.writeFile(largeFile, content);

      const reader = new TextFileReader({ maxFileSize: 1000 }); // 1000 byte limit

      await expect(reader.loadData(largeFile)).rejects.toThrow(FileSizeExceededError);

      // Verify error contains correct values
      try {
        await reader.loadData(largeFile);
      } catch (e) {
        expect(e).toBeInstanceOf(FileSizeExceededError);
        expect((e as FileSizeExceededError).fileSize).toBe(2000);
        expect((e as FileSizeExceededError).maxSize).toBe(1000);
        expect((e as FileSizeExceededError).filePath).toBe(largeFile);
      }
    });

    // REAL INTEGRATION TEST: File within limit should work
    it('should successfully read file within size limit', async () => {
      const smallFile = join(testDir, 'small.txt');
      await fs.writeFile(smallFile, 'Hello World');

      const reader = new TextFileReader({ maxFileSize: 1000 });
      const docs = await reader.loadData(smallFile);

      expect(docs).toHaveLength(1);
      expect(docs[0].text).toBe('Hello World');
    });
  });

  describe('MarkdownReader', () => {
    it('should accept custom max file size', () => {
      const reader = new MarkdownReader({ maxFileSize: 2048 });
      expect(reader['maxFileSize']).toBe(2048);
    });

    // REAL INTEGRATION TEST
    it('should throw FileSizeExceededError when markdown file exceeds limit', async () => {
      const largeFile = join(testDir, 'large.md');
      await fs.writeFile(largeFile, '# Title\n' + 'content '.repeat(500));

      const reader = new MarkdownReader({ maxFileSize: 100 });
      await expect(reader.loadData(largeFile)).rejects.toThrow(FileSizeExceededError);
    });
  });

  describe('JSONReader', () => {
    it('should accept custom max file size', () => {
      const reader = new JSONReader({ maxFileSize: 4096 });
      expect(reader['maxFileSize']).toBe(4096);
    });

    // REAL INTEGRATION TEST
    it('should throw FileSizeExceededError when JSON file exceeds limit', async () => {
      const largeFile = join(testDir, 'large.json');
      const data = { content: 'x'.repeat(2000) };
      await fs.writeFile(largeFile, JSON.stringify(data));

      const reader = new JSONReader({ maxFileSize: 100 });
      await expect(reader.loadData(largeFile)).rejects.toThrow(FileSizeExceededError);
    });
  });

  describe('CSVReader', () => {
    it('should accept custom max file size', () => {
      const reader = new CSVReader({ maxFileSize: 8192 });
      expect(reader['maxFileSize']).toBe(8192);
    });

    // REAL INTEGRATION TEST
    it('should throw FileSizeExceededError when CSV file exceeds limit', async () => {
      const largeFile = join(testDir, 'large.csv');
      const rows = Array.from({ length: 100 }, (_, i) => `col1,col2,col3,row${i}`).join('\n');
      await fs.writeFile(largeFile, 'a,b,c\n' + rows);

      const reader = new CSVReader({ maxFileSize: 100 });
      await expect(reader.loadData(largeFile)).rejects.toThrow(FileSizeExceededError);
    });
  });

  describe('HTMLReader', () => {
    it('should accept custom max file size', () => {
      const reader = new HTMLReader({ maxFileSize: 16384 });
      expect(reader['maxFileSize']).toBe(16384);
    });

    // REAL INTEGRATION TEST
    it('should throw FileSizeExceededError when HTML file exceeds limit', async () => {
      const largeFile = join(testDir, 'large.html');
      await fs.writeFile(largeFile, '<html><body>' + 'content '.repeat(500) + '</body></html>');

      const reader = new HTMLReader({ maxFileSize: 100 });
      await expect(reader.loadData(largeFile)).rejects.toThrow(FileSizeExceededError);
    });
  });
});

describe('SEC-002: Path Traversal Protection', () => {
  let testDir: string;
  let outsideDir: string;
  let fs: Awaited<ReturnType<typeof getFs>>;

  beforeEach(async () => {
    fs = await getFs();
    const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testDir = join(tmpdir(), `sec-002-root-${timestamp}`);
    outsideDir = join(tmpdir(), `sec-002-outside-${timestamp}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('PathTraversalError', () => {
    it('should create error with correct properties', () => {
      const error = new PathTraversalError('/etc/passwd', '/home/user');

      expect(error.name).toBe('PathTraversalError');
      expect(error.attemptedPath).toBe('/etc/passwd');
      expect(error.allowedRoot).toBe('/home/user');
      expect(error.message).toContain('Path traversal detected');
    });
  });

  describe('DirectoryReader - Configuration', () => {
    it('should skip symlinks by default', () => {
      const reader = new DirectoryReader();
      expect(reader['options'].followSymlinks).toBe(false);
    });

    it('should allow explicit symlink following', () => {
      const reader = new DirectoryReader({ followSymlinks: true });
      expect(reader['options'].followSymlinks).toBe(true);
    });

    it('should pass maxFileSize to created readers', () => {
      const reader = new DirectoryReader({ maxFileSize: 1024 });
      const registry = reader.getRegistry();

      const textReader = registry.getReaderForPath('test.txt');
      expect(textReader).toBeDefined();
      expect(textReader!['maxFileSize']).toBe(1024);
    });
  });

  describe('DirectoryReader - isWithinRoot Logic', () => {
    it('should validate paths stay within root', () => {
      const reader = new DirectoryReader();
      reader['resolvedRoot'] = '/home/user/documents';

      expect(reader['isWithinRoot']('/home/user/documents')).toBe(true);
      expect(reader['isWithinRoot']('/home/user/documents/file.txt')).toBe(true);
      expect(reader['isWithinRoot']('/home/user/documents/subdir/file.txt')).toBe(true);
      expect(reader['isWithinRoot']('/home/user')).toBe(false);
      expect(reader['isWithinRoot']('/etc/passwd')).toBe(false);
    });

    it('should prevent prefix-based path traversal attacks', () => {
      const reader = new DirectoryReader();
      reader['resolvedRoot'] = '/home/user/documents';

      // Prefix attack: /home/user/documents_backup looks like it starts with root
      // but is actually a sibling directory
      expect(reader['isWithinRoot']('/home/user/documents_backup')).toBe(false);
      expect(reader['isWithinRoot']('/home/user/documents_')).toBe(false);
      expect(reader['isWithinRoot']('/home/user/documentsfoo')).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      const reader = new DirectoryReader();
      reader['resolvedRoot'] = 'C:\\Users\\documents';

      expect(reader['isWithinRoot']('C:/Users/documents')).toBe(true);
      expect(reader['isWithinRoot']('C:/Users/documents/file.txt')).toBe(true);
      expect(reader['isWithinRoot']('C:/Users')).toBe(false);
    });
  });

  describe('DirectoryReader - REAL Filesystem Integration', () => {
    // REAL TEST: Symlinks should be skipped by default
    it('should NOT follow symlinks by default (security)', async () => {
      // Create a safe file in the root directory
      await fs.writeFile(join(testDir, 'safe.txt'), 'safe content');

      // Create a secret file outside and symlink to it
      await fs.writeFile(join(outsideDir, 'secret.txt'), 'SECRET DATA');

      try {
        await fs.symlink(join(outsideDir, 'secret.txt'), join(testDir, 'link-to-secret.txt'));
      } catch {
        // Skip test on systems that don't support symlinks (Windows without admin)
        return;
      }

      const reader = new DirectoryReader({ extensions: ['.txt'] });
      const docs = await reader.loadData(testDir);

      // Should only read the safe file, NOT the symlinked secret
      expect(docs.length).toBe(1);
      expect(docs[0].text).toBe('safe content');
      expect(docs.every((d) => d.text !== 'SECRET DATA')).toBe(true);
    });

    // REAL TEST: With followSymlinks=true but outside root should still be blocked
    it('should block symlinks pointing outside root even when followSymlinks=true', async () => {
      // Create a safe file
      await fs.writeFile(join(testDir, 'safe.txt'), 'safe content');

      // Create secret file outside
      await fs.writeFile(join(outsideDir, 'secret.txt'), 'SECRET OUTSIDE');

      try {
        await fs.symlink(join(outsideDir, 'secret.txt'), join(testDir, 'escape-link.txt'));
      } catch {
        return; // Skip on systems without symlink support
      }

      const reader = new DirectoryReader({
        extensions: ['.txt'],
        followSymlinks: true, // Explicitly allow symlinks
      });
      const docs = await reader.loadData(testDir);

      // Secret should still be blocked because realpath is outside root
      expect(docs.every((d) => d.text !== 'SECRET OUTSIDE')).toBe(true);
    });

    // REAL TEST: Regular subdirectories should work fine
    it('should correctly read files in subdirectories', async () => {
      const subDir = join(testDir, 'subdir');
      await fs.mkdir(subDir, { recursive: true });

      await fs.writeFile(join(testDir, 'root.txt'), 'root file');
      await fs.writeFile(join(subDir, 'nested.txt'), 'nested file');

      const reader = new DirectoryReader({ extensions: ['.txt'] });
      const docs = await reader.loadData(testDir);

      expect(docs.length).toBe(2);
      expect(docs.map((d) => d.text).toSorted()).toEqual(['nested file', 'root file']);
    });

    // REAL TEST: Directory symlinks pointing outside should be blocked
    it('should block directory symlinks pointing outside root', async () => {
      // Create safe content
      await fs.writeFile(join(testDir, 'safe.txt'), 'safe');

      // Create secret directory outside with secret file
      const secretSubdir = join(outsideDir, 'secrets');
      await fs.mkdir(secretSubdir, { recursive: true });
      await fs.writeFile(join(secretSubdir, 'password.txt'), 'PASSWORD123');

      try {
        // Create symlink to the entire secret directory
        await fs.symlink(secretSubdir, join(testDir, 'linked-secrets'));
      } catch {
        return; // Skip on systems without symlink support
      }

      const reader = new DirectoryReader({
        extensions: ['.txt'],
        recursive: true,
        followSymlinks: true,
      });
      const docs = await reader.loadData(testDir);

      // Should NOT contain the password file
      expect(docs.every((d) => d.text !== 'PASSWORD123')).toBe(true);
    });
  });
});

describe('SEC-003: ReDoS Protection', () => {
  describe('TokenTextSplitter.splitBySentences', () => {
    it('should split at sentence boundaries', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'First sentence. Second sentence! Third sentence?';
      const sentences = splitter['splitBySentences'](text);

      expect(sentences).toEqual([
        'First sentence.',
        'Second sentence!',
        'Third sentence?',
      ]);
    });

    it('should handle multiple whitespace between sentences', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'First.   Second!    Third?';
      const sentences = splitter['splitBySentences'](text);

      expect(sentences).toEqual(['First.', 'Second!', 'Third?']);
    });

    it('should handle sentence without trailing whitespace', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'Only sentence.';
      const sentences = splitter['splitBySentences'](text);

      expect(sentences).toEqual(['Only sentence.']);
    });

    it('should handle text without sentence enders', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'No sentence enders here';
      const sentences = splitter['splitBySentences'](text);

      expect(sentences).toEqual(['No sentence enders here']);
    });

    it('should handle abbreviations (periods not followed by space)', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'Dr.Smith went to U.S.A. He returned.';
      const sentences = splitter['splitBySentences'](text);

      // Should not split at Dr. or U.S.A. because no space follows period inside
      expect(sentences).toHaveLength(2);
      expect(sentences[0]).toBe('Dr.Smith went to U.S.A.');
      expect(sentences[1]).toBe('He returned.');
    });

    it('should perform in linear time on adversarial input', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      // Create adversarial input that would cause exponential backtracking
      // with regex lookbehind: many periods followed by many spaces
      const adversarial = '.' + ' '.repeat(10000) + '.'.repeat(10000);

      const start = Date.now();
      splitter['splitBySentences'](adversarial);
      const elapsed = Date.now() - start;

      // Should complete in reasonable time (< 100ms for O(n) algorithm)
      // Regex with backtracking could take minutes or hang
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle newlines as whitespace', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const text = 'First sentence.\nSecond sentence.';
      const sentences = splitter['splitBySentences'](text);

      expect(sentences).toEqual(['First sentence.', 'Second sentence.']);
    });

    it('should handle empty text', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const sentences = splitter['splitBySentences']('');
      expect(sentences).toEqual([]);
    });

    it('should handle only whitespace', () => {
      const splitter = new TokenTextSplitter({ chunkSize: 1000 });

      const sentences = splitter['splitBySentences']('   ');
      expect(sentences).toEqual([]);
    });
  });
});
