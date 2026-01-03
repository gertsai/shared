import { FileReader, type FileReaderConfig } from './base';
import { type Document } from '../nodes/document';
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
export declare class MarkdownReader extends FileReader {
    readonly supportedExtensions: readonly [".md", ".markdown"];
    constructor(config?: FileReaderConfig);
    loadData(source: string): Promise<Document[]>;
    /**
     * Extract YAML frontmatter from markdown content
     * Frontmatter is delimited by --- at start and end
     */
    private extractFrontmatter;
    /**
     * Remove frontmatter from content, returning clean markdown
     * Handles both empty frontmatter (---\n---) and populated frontmatter
     */
    private removeFrontmatter;
    /**
     * Extract title from first H1 heading or frontmatter title field
     */
    private extractTitle;
}
//# sourceMappingURL=markdown.d.ts.map