import { FileReader, type FileReaderConfig } from './base';
import { createDocument, type Document } from '../nodes/document';
import type { Stats } from 'fs';

/**
 * JSONReaderOptions - Configuration for JSON parsing
 *
 * @property contentField - Field to use as document text content (default: stringify whole object)
 * @property metadataFields - Fields to extract into metadata
 * @property isJsonLines - Parse as JSONL (newline-delimited JSON) format
 */
export interface JSONReaderOptions extends FileReaderConfig {
  /**
   * Field name to extract as document text content.
   * If not specified, the entire JSON object will be stringified.
   */
  contentField?: string;

  /**
   * List of field names to extract into document metadata.
   * These fields will be added to the metadata.extra object.
   */
  metadataFields?: string[];

  /**
   * Parse file as JSON Lines (newline-delimited JSON).
   * If not specified, will auto-detect based on .jsonl extension.
   */
  isJsonLines?: boolean;
}

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
  readonly supportedExtensions = ['.json', '.jsonl'] as const;
  private readerOptions: JSONReaderOptions;

  constructor(options: JSONReaderOptions = {}) {
    super(options);
    this.readerOptions = options;
  }

  async loadData(source: string): Promise<Document[]> {
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
  private parseJson(content: string, source: string, stats: Stats): Document[] {
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
  private parseJsonLines(content: string, source: string, stats: Stats): Document[] {
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
  private extractText(item: unknown): string {
    if (!item || typeof item !== 'object') {
      return String(item ?? '');
    }

    // If contentField is specified, use that field
    if (this.readerOptions.contentField) {
      const value = (item as Record<string, unknown>)[this.readerOptions.contentField];
      return String(value ?? '');
    }

    // Otherwise, stringify the entire object with pretty formatting
    return JSON.stringify(item, null, 2);
  }

  /**
   * Extract metadata fields from JSON object
   */
  private extractMetadata(item: unknown): Record<string, unknown> {
    if (!item || typeof item !== 'object') {
      return {};
    }

    // If no metadataFields specified, return empty object
    if (!this.readerOptions.metadataFields || this.readerOptions.metadataFields.length === 0) {
      return {};
    }

    // Extract specified fields
    const metadata: Record<string, unknown> = {};
    const obj = item as Record<string, unknown>;

    for (const field of this.readerOptions.metadataFields) {
      if (field in obj) {
        metadata[field] = obj[field];
      }
    }

    return metadata;
  }
}
