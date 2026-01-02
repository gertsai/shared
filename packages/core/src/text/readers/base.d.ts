import type { Document } from '../nodes/document';
/**
 * Default maximum file size for readers (50MB).
 * Prevents memory exhaustion from maliciously large files.
 */
export declare const DEFAULT_MAX_FILE_SIZE: number;
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
export declare class FileSizeExceededError extends Error {
    readonly filePath: string;
    readonly fileSize: number;
    readonly maxSize: number;
    constructor(filePath: string, fileSize: number, maxSize: number);
}
export interface IDocumentReader {
    loadData(source: string): Promise<Document[]>;
    canRead(source: string): boolean;
}
/**
 * Configuration for FileReader.
 */
export interface FileReaderConfig extends ReaderSecurityConfig {
}
export declare abstract class FileReader implements IDocumentReader {
    abstract readonly supportedExtensions: readonly string[];
    protected readonly maxFileSize: number;
    constructor(config?: FileReaderConfig);
    canRead(source: string): boolean;
    /**
     * Validate file size before reading.
     * @throws FileSizeExceededError if file is too large
     */
    protected validateFileSize(filePath: string): Promise<number>;
    abstract loadData(source: string): Promise<Document[]>;
}
