import { FileReader, type FileReaderConfig } from './base';
import { type Document } from '../nodes/document';
export interface CSVReaderOptions extends FileReaderConfig {
    /** Delimiter character (default: auto-detect) */
    delimiter?: string;
    /** Whether first row contains headers (default: true) */
    hasHeader?: boolean;
    /** Column names or indices to use as document text */
    contentColumns?: string[] | number[];
    /** Column names or indices to extract as metadata */
    metadataColumns?: string[] | number[];
}
/**
 * CSVReader - Reads CSV and TSV files
 *
 * Parses CSV/TSV files and creates Document objects for each row.
 * Supports quoted fields, header detection, and flexible column mapping.
 *
 * Features:
 * - Auto-detects delimiter (comma vs tab)
 * - Handles quoted fields with embedded delimiters
 * - Maps columns to document content or metadata
 * - Creates one Document per row
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
export declare class CSVReader extends FileReader {
    readonly supportedExtensions: readonly [".csv", ".tsv"];
    private readerOptions;
    constructor(options?: CSVReaderOptions);
    loadData(source: string): Promise<Document[]>;
    /**
     * Parse CSV content into rows of fields
     * Handles quoted fields with embedded delimiters and quotes
     */
    private parseCSV;
    /**
     * Auto-detect delimiter from file extension and content
     */
    private detectDelimiter;
    /**
     * Extract content text from row based on contentColumns option
     */
    private getContentText;
    /**
     * Extract metadata from row based on metadataColumns option
     */
    private getMetadata;
}
//# sourceMappingURL=csv.d.ts.map