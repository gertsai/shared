import { FileReader, type FileReaderConfig } from './base';
import { createDocument, type Document, type DocumentMetadata } from '../nodes/document';

/**
 * MarkdownReader - Reads Markdown files (.md, .markdown)
 *
 * Features:
 * - YAML frontmatter extraction and parsing
 * - Automatic title extraction from first H1 or frontmatter
 * - File metadata (path, size, timestamps)
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
export class MarkdownReader extends FileReader {
  readonly supportedExtensions = ['.md', '.markdown'] as const;

  constructor(config: FileReaderConfig = {}) {
    super(config);
  }

  async loadData(source: string): Promise<Document[]> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // SEC-001: Validate file size before reading
    await this.validateFileSize(source);

    const rawContent = await fs.readFile(source, 'utf-8');
    const stats = await fs.stat(source);

    const frontmatter = this.extractFrontmatter(rawContent);
    const content = this.removeFrontmatter(rawContent);
    const title = this.extractTitle(content, frontmatter);

    const metadata: Partial<DocumentMetadata> = {
      file_path: source,
      file_name: path.basename(source),
      file_type: 'text/markdown',
      file_size: stats.size,
      source_type: 'file',
      created_at: stats.birthtime.toISOString(),
      modified_at: stats.mtime.toISOString(),
      extra: {
        ...frontmatter,
        ...(title && { title }),
      },
    };

    return [createDocument(content, metadata)];
  }

  /**
   * Extract YAML frontmatter from markdown content
   * Frontmatter is delimited by --- at start and end
   */
  private extractFrontmatter(content: string): Record<string, string> {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
    const match = content.match(frontmatterRegex);

    if (!match || !match[1]) {
      return {};
    }

    const metadata: Record<string, string> = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key && value) {
        metadata[key] = value;
      }
    }

    return metadata;
  }

  /**
   * Remove frontmatter from content, returning clean markdown
   * Handles both empty frontmatter (---\n---) and populated frontmatter
   */
  private removeFrontmatter(content: string): string {
    // Match frontmatter: --- followed by optional content, then ---
    // The [\s\S]*? handles both empty and non-empty frontmatter
    return content.replace(/^---\n(?:[\s\S]*?\n)?---\n?/, '').trim();
  }

  /**
   * Extract title from first H1 heading or frontmatter title field
   */
  private extractTitle(content: string, frontmatter: Record<string, string>): string | null {
    // Check frontmatter first
    if (frontmatter.title) {
      return frontmatter.title;
    }

    // Look for first H1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match?.[1]) {
      return h1Match[1].trim();
    }

    return null;
  }
}
