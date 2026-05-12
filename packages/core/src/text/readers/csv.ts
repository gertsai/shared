import { FileReader, type FileReaderConfig } from './base';
import { createDocument, type Document } from '../nodes/document';

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
export class CSVReader extends FileReader {
  readonly supportedExtensions = ['.csv', '.tsv'] as const;
  private readerOptions: CSVReaderOptions;

  constructor(options: CSVReaderOptions = {}) {
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

    const delimiter = this.readerOptions.delimiter ?? this.detectDelimiter(source, content);
    const rows = this.parseCSV(content, delimiter);

    if (rows.length === 0) return [];

    const hasHeader = this.readerOptions.hasHeader ?? true;
    // rows.length > 0 verified above
    const headers = hasHeader ? rows[0]! : rows[0]!.map((_, i) => `col_${i}`);
    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows.map((row, index) => {
      const rowObj = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
      const text = this.getContentText(rowObj, headers);
      const metadata = this.getMetadata(rowObj, headers);

      return createDocument(text, {
        file_path: source,
        file_name: path.basename(source),
        file_type: 'text/csv',
        file_size: stats.size,
        source_type: 'file',
        created_at: stats.birthtime.toISOString(),
        modified_at: stats.mtime.toISOString(),
        extra: { ...metadata, row_index: index },
      });
    });
  }

  /**
   * Parse CSV content into rows of fields
   * Handles quoted fields with embedded delimiters and quotes
   */
  private parseCSV(content: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else if (char === '"') {
          // End quote
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          row.push(field.trim());
          field = '';
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          row.push(field.trim());
          if (row.some((f) => f)) rows.push(row);
          row = [];
          field = '';
          if (char === '\r') i++;
        } else {
          field += char;
        }
      }
    }

    // Handle last row
    if (field || row.length) {
      row.push(field.trim());
      if (row.some((f) => f)) rows.push(row);
    }

    return rows;
  }

  /**
   * Auto-detect delimiter from file extension and content
   */
  private detectDelimiter(source: string, content: string): string {
    if (source.endsWith('.tsv')) return '\t';

    const firstLine = content.split('\n')[0] ?? '';
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    return tabs > commas ? '\t' : ',';
  }

  /**
   * Extract content text from row based on contentColumns option
   */
  private getContentText(rowObj: Record<string, string>, headers: string[]): string {
    const contentCols = this.readerOptions.contentColumns;

    if (!contentCols || contentCols.length === 0) {
      // Use all columns as content
      return Object.values(rowObj).filter(Boolean).join(' | ');
    }

    const values: string[] = [];

    for (const col of contentCols) {
      if (typeof col === 'number') {
        const headerKey = headers[col];
        values.push(headerKey ? (rowObj[headerKey] ?? '') : '');
      } else {
        values.push(rowObj[col] ?? '');
      }
    }

    return values.filter(Boolean).join(' | ');
  }

  /**
   * Extract metadata from row based on metadataColumns option
   */
  private getMetadata(
    rowObj: Record<string, string>,
    headers: string[]
  ): Record<string, string> {
    const metaCols = this.readerOptions.metadataColumns;

    if (!metaCols || metaCols.length === 0) {
      // Include all columns as metadata
      return rowObj;
    }

    const metadata: Record<string, string> = {};

    for (const col of metaCols) {
      if (typeof col === 'number') {
        const key = headers[col];
        if (key !== undefined) {
          metadata[key] = rowObj[key] ?? '';
        }
      } else {
        metadata[col] = rowObj[col] ?? '';
      }
    }

    return metadata;
  }
}
