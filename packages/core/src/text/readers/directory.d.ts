import type { IDocumentReader, ReaderSecurityConfig } from './base';
import type { Document } from '../nodes/document';
import { ReaderRegistry } from './registry';
/**
 * Error thrown when a path traversal attempt is detected.
 */
export declare class PathTraversalError extends Error {
    readonly attemptedPath: string;
    readonly allowedRoot: string;
    constructor(attemptedPath: string, allowedRoot: string);
}
export interface DirectoryReaderOptions extends ReaderSecurityConfig {
    /**
     * Whether to recursively read subdirectories
     * @default true
     */
    recursive?: boolean;
    /**
     * Filter files by extensions (e.g., ['.txt', '.md'])
     * If not specified, all registered extensions are included
     * @default undefined (all registered extensions)
     */
    extensions?: string[];
    /**
     * Glob patterns to exclude (e.g., ['node_modules/**', '*.log'])
     * @default []
     */
    exclude?: string[];
    /**
     * Maximum number of files to read
     * @default 1000
     */
    maxFiles?: number;
    /**
     * Custom registry to use for finding readers
     * If not specified, a default registry with TextFileReader and MarkdownReader will be created
     * @default undefined (creates default registry)
     */
    registry?: ReaderRegistry;
    /**
     * Allow symlinks to be followed (security consideration).
     * If false, symlinks will be skipped to prevent path traversal via symlinks.
     * @default false
     */
    followSymlinks?: boolean;
}
/**
 * DirectoryReader - Recursively reads all files in a directory
 *
 * Features:
 * - Recursive directory traversal with configurable depth
 * - Automatic reader selection via ReaderRegistry
 * - File filtering by extension
 * - Glob-based exclusion patterns
 * - Maximum file limits for safety
 * - Error handling for individual files (continues on failure)
 *
 * Security:
 * - Path traversal protection (all paths validated against root)
 * - Symlinks skipped by default to prevent escaping root
 * - File size limits enforced by individual readers
 *
 * Does NOT extend FileReader as directories aren't files - implements IDocumentReader directly.
 */
export declare class DirectoryReader implements IDocumentReader {
    private readonly registry;
    private readonly options;
    private resolvedRoot;
    constructor(options?: DirectoryReaderOptions);
    /**
     * Check if source is a directory that can be read
     */
    canRead(source: string): boolean;
    /**
     * Load all documents from directory and subdirectories
     * Uses registry to find appropriate reader for each file
     *
     * @throws PathTraversalError if any file path escapes the source directory
     */
    loadData(source: string): Promise<Document[]>;
    /**
     * Recursively collect all files from directory tree.
     *
     * SEC-002: Validates all paths stay within the resolved root directory.
     */
    private collectFiles;
    /**
     * SEC-002: Check if a resolved path is within the allowed root directory.
     * Prevents path traversal attacks via symlinks or directory traversal.
     */
    private isWithinRoot;
    /**
     * Check if path should be excluded based on glob patterns
     */
    private shouldExclude;
    /**
     * Check if file matches the extension filter
     * If no extensions specified, all files match
     */
    private matchesExtensions;
    /**
     * Simple glob pattern matching
     * Supports:
     * - * (matches any characters except /)
     * - ** (matches any characters including /)
     * - ? (matches single character)
     */
    private matchGlob;
    /**
     * Create default registry with all available readers
     * @param maxFileSize - Optional file size limit to pass to readers
     */
    private createDefaultRegistry;
    /**
     * Get the current reader registry
     */
    getRegistry(): ReaderRegistry;
    /**
     * Get current options
     */
    getOptions(): Readonly<Required<Omit<DirectoryReaderOptions, 'maxFileSize'>> & {
        maxFileSize?: number;
    }>;
}
//# sourceMappingURL=directory.d.ts.map