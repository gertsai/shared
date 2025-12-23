import { FileReader } from './base';
import { createDocument } from '../nodes/document';
export class HTMLReader extends FileReader {
    supportedExtensions = ['.html', '.htm'];
    readerOptions;
    constructor(options = {}) {
        super(options);
        this.readerOptions = options;
    }
    async loadData(source) {
        const fs = await import('fs/promises');
        const path = await import('path');
        // SEC-001: Validate file size before reading
        await this.validateFileSize(source);
        const content = await fs.readFile(source, 'utf-8');
        const stats = await fs.stat(source);
        const title = this.extractTitle(content);
        const metaTags = this.extractMetaTags(content);
        const text = this.htmlToText(content);
        const metadata = {
            file_path: source,
            file_name: path.basename(source),
            file_type: 'text/html',
            file_size: stats.size,
            source_type: 'file',
            created_at: stats.birthtime.toISOString(),
            modified_at: stats.mtime.toISOString(),
            extra: {
                ...(title && { title }),
                ...metaTags,
            },
        };
        return [createDocument(text, metadata)];
    }
    /**
     * Extract title from <title> tag
     */
    extractTitle(html) {
        if (this.readerOptions.extractTitle === false) {
            return null;
        }
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match?.[1]?.trim() ?? null;
    }
    /**
     * Extract metadata from <meta> tags
     * Looks for name/property and content attributes
     */
    extractMetaTags(html) {
        if (this.readerOptions.extractMeta === false) {
            return {};
        }
        const meta = {};
        // Match <meta> tags with name/property and content attributes
        // Handles both orders: name then content, or content then name
        const nameContentRegex = /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?\s+content=["']([^"']+)["'][^>]*>/gi;
        const contentNameRegex = /<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["'][^>]*?\s+(?:name|property)=["']([^"']+)["'][^>]*>/gi;
        let match;
        // Process name-then-content format
        while ((match = nameContentRegex.exec(html)) !== null) {
            meta[match[1]] = match[2];
        }
        // Process content-then-name format
        while ((match = contentNameRegex.exec(html)) !== null) {
            meta[match[2]] = match[1];
        }
        return meta;
    }
    /**
     * Convert HTML to plain text
     * - Removes script and style elements
     * - Optionally preserves links
     * - Converts block elements to newlines
     * - Decodes HTML entities
     * - Cleans up whitespace
     */
    htmlToText(html) {
        let text = html;
        // Remove script and style elements
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        // Handle links
        if (this.readerOptions.preserveLinks) {
            text = text.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
        }
        // Convert block elements to newlines
        text = text.replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|header|footer|nav|aside)[^>]*>/gi, '\n');
        text = text.replace(/<br[^>]*\/?>/gi, '\n');
        // Remove remaining tags
        text = text.replace(/<[^>]+>/g, '');
        // Decode HTML entities
        text = this.decodeEntities(text);
        // Clean up whitespace
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/^\s+|\s+$/gm, ''); // Trim each line
        return text.trim();
    }
    /**
     * Decode common HTML entities
     */
    decodeEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'",
            '&nbsp;': ' ',
            '&mdash;': '—',
            '&ndash;': '–',
            '&hellip;': '…',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
        };
        return text.replace(/&[#\w]+;/g, (entity) => entities[entity] ?? entity);
    }
}
