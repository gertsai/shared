import type { Document } from '../nodes/document';

/**
 * Default maximum file size for readers (50MB).
 * Prevents memory exhaustion from maliciously large files.
 */
export const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Security configuration for readers.
 */
export interface ReaderSecurityConfig {
  /**
   * Maximum file size in bytes.
   * Files exceeding this limit will be rejected.
   * @default 50 * 1024 * 1024 (50MB)
   */
  maxFileSize?: number;
}

/**
 * Error thrown when file size exceeds the configured limit.
 */
export class FileSizeExceededError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly fileSize: number,
    public readonly maxSize: number
  ) {
    super(
      `File size ${fileSize} bytes exceeds maximum allowed size of ${maxSize} bytes: ${filePath}`
    );
    this.name = 'FileSizeExceededError';
  }
}

export interface IDocumentReader {
  loadData(source: string): Promise<Document[]>;
  canRead(source: string): boolean;
}

/**
 * Configuration for FileReader.
 */
export interface FileReaderConfig extends ReaderSecurityConfig {
  // Additional reader-specific config can go here
}

export abstract class FileReader implements IDocumentReader {
  abstract readonly supportedExtensions: readonly string[];

  protected readonly maxFileSize: number;

  constructor(config: FileReaderConfig = {}) {
    this.maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  canRead(source: string): boolean {
    const normalized = source.toLowerCase();
    return this.supportedExtensions.some((ext) => normalized.endsWith(ext.toLowerCase()));
  }

  /**
   * Validate file size before reading.
   * @throws FileSizeExceededError if file is too large
   */
  protected async validateFileSize(filePath: string): Promise<number> {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);

    if (stats.size > this.maxFileSize) {
      throw new FileSizeExceededError(filePath, stats.size, this.maxFileSize);
    }

    return stats.size;
  }

  abstract loadData(source: string): Promise<Document[]>;
}

