import type { IDocumentReader, FileReader } from './base';
/**
 * ReaderRegistry - Central registry for document readers
 *
 * Manages registration and lookup of document readers by file extension.
 * Provides methods to:
 * - Register readers for specific extensions
 * - Look up readers by extension
 * - List all registered readers and extensions
 */
export declare class ReaderRegistry {
    private readonly readersByExtension;
    private readonly registeredReaders;
    /**
     * Register a reader for specific file extensions
     * @throws Error if extension already has a registered reader
     */
    register(reader: IDocumentReader, extensions: readonly string[]): void;
    /**
     * Register a FileReader using its supportedExtensions property
     */
    registerFileReader(reader: FileReader): void;
    /**
     * Get reader for a specific file extension
     */
    getReaderForExtension(ext: string): IDocumentReader | null;
    /**
     * Get reader for a file path (extracts extension automatically)
     */
    getReaderForPath(filePath: string): IDocumentReader | null;
    /**
     * List all unique registered readers
     */
    listReaders(): IDocumentReader[];
    /**
     * List all registered file extensions
     */
    listExtensions(): string[];
    /**
     * Check if a reader exists for the given extension
     */
    hasReaderForExtension(ext: string): boolean;
    /**
     * Get the number of registered readers
     */
    get size(): number;
    /**
     * Clear all registered readers
     */
    clear(): void;
}
