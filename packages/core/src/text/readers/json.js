import { FileReader } from './base';
import { createDocument } from '../nodes/document';
/**
 * JSONReader - Reads JSON files (.json, .jsonl)
 *
 * Supports:
 * - Single JSON objects
 * - JSON arrays (each item becomes a document)
 * - JSON Lines format (newline-delimited JSON)
 * - Custom field extraction for content and metadata
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 *
 * @example
 * ```typescript
 * const reader = new JSONReader({
 *   contentField: 'description',
 *   metadataFields: ['id', 'category', 'tags']
 * });
 * const docs = await reader.loadData('data.json');
 * ```
 */
export class JSONReader extends FileReader {
    supportedExtensions = ['.json', '.jsonl'];
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
        // Auto-detect JSONL format based on file extension
        const isJsonLines = this.readerOptions.isJsonLines ?? source.endsWith('.jsonl');
        if (isJsonLines) {
            return this.parseJsonLines(content, source, stats);
        }
        return this.parseJson(content, source, stats);
    }
    /**
     * Parse standard JSON file (single object or array)
     */
    parseJson(content, source, stats) {
        const path = require('path');
        const data = JSON.parse(content);
        // Normalize to array
        const items = Array.isArray(data) ? data : [data];
        return items.map((item, index) => {
            const text = this.extractText(item);
            const metadata = this.extractMetadata(item);
            return createDocument(text, {
                file_path: source,
                file_name: path.basename(source),
                file_type: 'application/json',
                file_size: stats.size,
                source_type: 'file',
                created_at: stats.birthtime.toISOString(),
                modified_at: stats.mtime.toISOString(),
                extra: {
                    ...metadata,
                    item_index: index,
                    total_items: items.length,
                },
            });
        });
    }
    /**
     * Parse JSON Lines format (newline-delimited JSON)
     */
    parseJsonLines(content, source, stats) {
        const path = require('path');
        const lines = content.split('\n').filter((line) => line.trim().length > 0);
        return lines.map((line, index) => {
            const item = JSON.parse(line);
            const text = this.extractText(item);
            const metadata = this.extractMetadata(item);
            return createDocument(text, {
                file_path: source,
                file_name: path.basename(source),
                file_type: 'application/x-ndjson',
                file_size: stats.size,
                source_type: 'file',
                created_at: stats.birthtime.toISOString(),
                modified_at: stats.mtime.toISOString(),
                extra: {
                    ...metadata,
                    line_number: index + 1,
                    total_lines: lines.length,
                },
            });
        });
    }
    /**
     * Extract text content from JSON object
     */
    extractText(item) {
        if (!item || typeof item !== 'object') {
            return String(item ?? '');
        }
        // If contentField is specified, use that field
        if (this.readerOptions.contentField) {
            const value = item[this.readerOptions.contentField];
            return String(value ?? '');
        }
        // Otherwise, stringify the entire object with pretty formatting
        return JSON.stringify(item, null, 2);
    }
    /**
     * Extract metadata fields from JSON object
     */
    extractMetadata(item) {
        if (!item || typeof item !== 'object') {
            return {};
        }
        // If no metadataFields specified, return empty object
        if (!this.readerOptions.metadataFields || this.readerOptions.metadataFields.length === 0) {
            return {};
        }
        // Extract specified fields
        const metadata = {};
        const obj = item;
        for (const field of this.readerOptions.metadataFields) {
            if (field in obj) {
                metadata[field] = obj[field];
            }
        }
        return metadata;
    }
}
