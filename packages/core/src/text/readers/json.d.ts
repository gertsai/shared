import { FileReader, type FileReaderConfig } from './base';
import { type Document } from '../nodes/document';
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
export declare class JSONReader extends FileReader {
    readonly supportedExtensions: readonly [".json", ".jsonl"];
    private readerOptions;
    constructor(options?: JSONReaderOptions);
    loadData(source: string): Promise<Document[]>;
    /**
     * Parse standard JSON file (single object or array)
     */
    private parseJson;
    /**
     * Parse JSON Lines format (newline-delimited JSON)
     */
    private parseJsonLines;
    /**
     * Extract text content from JSON object
     */
    private extractText;
    /**
     * Extract metadata fields from JSON object
     */
    private extractMetadata;
}
