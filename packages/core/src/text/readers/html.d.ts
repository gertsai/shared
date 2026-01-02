import { FileReader, type FileReaderConfig } from './base';
import { type Document } from '../nodes/document';
/**
 * HTMLReader - Reads HTML files (.html, .htm)
 *
 * Features:
 * - Strips HTML tags to extract plain text
 * - Extracts metadata from <title> and <meta> tags
 * - Optional link preservation in [text](url) format
 * - No external dependencies (regex-based parsing)
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
export interface HTMLReaderOptions extends FileReaderConfig {
    /**
     * Extract <title> tag content (default: true)
     */
    extractTitle?: boolean;
    /**
     * Extract <meta> tags (name/property and content) (default: true)
     */
    extractMeta?: boolean;
    /**
     * Preserve links as [text](url) format (default: false)
     */
    preserveLinks?: boolean;
}
export declare class HTMLReader extends FileReader {
    readonly supportedExtensions: readonly [".html", ".htm"];
    private readerOptions;
    constructor(options?: HTMLReaderOptions);
    loadData(source: string): Promise<Document[]>;
    /**
     * Extract title from <title> tag
     */
    private extractTitle;
    /**
     * Extract metadata from <meta> tags
     * Looks for name/property and content attributes
     */
    private extractMetaTags;
    /**
     * Convert HTML to plain text
     * - Removes script and style elements
     * - Optionally preserves links
     * - Converts block elements to newlines
     * - Decodes HTML entities
     * - Cleans up whitespace
     */
    private htmlToText;
    /**
     * Decode common HTML entities
     */
    private decodeEntities;
}
