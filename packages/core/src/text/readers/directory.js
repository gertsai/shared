"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectoryReader = exports.PathTraversalError = void 0;
const registry_1 = require("./registry");
const text_1 = require("./text");
const markdown_1 = require("./markdown");
/**
 * Error thrown when a path traversal attempt is detected.
 */
class PathTraversalError extends Error {
    attemptedPath;
    allowedRoot;
    constructor(attemptedPath, allowedRoot) {
        super(`Path traversal detected: "${attemptedPath}" is outside allowed root "${allowedRoot}"`);
        this.attemptedPath = attemptedPath;
        this.allowedRoot = allowedRoot;
        this.name = 'PathTraversalError';
    }
}
exports.PathTraversalError = PathTraversalError;
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
class DirectoryReader {
    registry;
    options;
    resolvedRoot = null;
    constructor(options = {}) {
        this.options = {
            recursive: options.recursive ?? true,
            extensions: options.extensions ?? [],
            exclude: options.exclude ?? [],
            maxFiles: options.maxFiles ?? 1000,
            registry: options.registry ?? this.createDefaultRegistry(options.maxFileSize),
            followSymlinks: options.followSymlinks ?? false,
            maxFileSize: options.maxFileSize,
        };
        this.registry = this.options.registry;
    }
    /**
     * Check if source is a directory that can be read
     */
    canRead(source) {
        try {
            const fs = require('fs');
            return fs.statSync(source).isDirectory();
        }
        catch {
            return false;
        }
    }
    /**
     * Load all documents from directory and subdirectories
     * Uses registry to find appropriate reader for each file
     *
     * @throws PathTraversalError if any file path escapes the source directory
     */
    async loadData(source) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        // Verify directory exists and resolve to absolute path
        try {
            const stats = await fs.stat(source);
            if (!stats.isDirectory()) {
                throw new Error(`Source is not a directory: ${source}`);
            }
            // SEC-002: Store resolved root for path traversal validation
            this.resolvedRoot = await fs.realpath(source);
        }
        catch (error) {
            throw new Error(`Cannot read directory: ${source}`, { cause: error });
        }
        // Collect all files that match criteria
        const files = await this.collectFiles(source, path, fs);
        // Apply maxFiles limit
        const filesToRead = files.slice(0, this.options.maxFiles);
        // Read each file using appropriate reader
        const docs = [];
        const errors = [];
        for (const file of filesToRead) {
            const reader = this.registry.getReaderForPath(file);
            if (!reader) {
                // No reader available for this file type, skip it
                continue;
            }
            try {
                const fileDocs = await reader.loadData(file);
                docs.push(...fileDocs);
            }
            catch (error) {
                // Log error but continue processing other files
                errors.push({ file, error });
                console.warn(`Failed to read file ${file}:`, error);
            }
        }
        // If we hit the maxFiles limit, warn the user
        if (files.length > this.options.maxFiles) {
            console.warn(`Directory contains ${files.length} files, but maxFiles limit is ${this.options.maxFiles}. ` +
                `Only first ${this.options.maxFiles} files were processed.`);
        }
        return docs;
    }
    /**
     * Recursively collect all files from directory tree.
     *
     * SEC-002: Validates all paths stay within the resolved root directory.
     */
    async collectFiles(dir, path, fs) {
        const files = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                // SEC-002: Skip symlinks unless explicitly allowed
                if (entry.isSymbolicLink() && !this.options.followSymlinks) {
                    continue;
                }
                // Check exclusion patterns
                if (this.shouldExclude(fullPath)) {
                    continue;
                }
                // SEC-002: Validate path is within root
                // ALWAYS use realpath for validation to handle systems where tmpdir
                // uses symlinks (e.g., macOS /var/folders -> /private/var/folders)
                let resolvedPath;
                try {
                    // Always resolve to real path for security validation
                    resolvedPath = await fs.realpath(fullPath);
                    // Validate resolved path is within root directory
                    if (!this.isWithinRoot(resolvedPath)) {
                        console.warn(`Skipping path outside root: ${fullPath}`);
                        continue;
                    }
                }
                catch {
                    // Can't resolve path, skip it
                    continue;
                }
                if (entry.isDirectory() || (entry.isSymbolicLink() && this.options.followSymlinks)) {
                    // Check if symlink points to a directory
                    try {
                        const stat = await fs.stat(fullPath);
                        if (stat.isDirectory()) {
                            // Recurse into subdirectories if enabled
                            if (this.options.recursive) {
                                const subFiles = await this.collectFiles(fullPath, path, fs);
                                files.push(...subFiles);
                            }
                        }
                        else if (stat.isFile()) {
                            // Symlink to file
                            if (this.matchesExtensions(fullPath)) {
                                files.push(resolvedPath);
                            }
                        }
                    }
                    catch {
                        // Can't stat, skip
                        continue;
                    }
                }
                else if (entry.isFile()) {
                    // Check if file matches extension filter
                    if (this.matchesExtensions(fullPath)) {
                        files.push(resolvedPath);
                    }
                }
            }
        }
        catch (error) {
            // Log error but don't fail - just skip this directory
            console.warn(`Failed to read directory ${dir}:`, error);
        }
        return files;
    }
    /**
     * SEC-002: Check if a resolved path is within the allowed root directory.
     * Prevents path traversal attacks via symlinks or directory traversal.
     */
    isWithinRoot(resolvedPath) {
        if (!this.resolvedRoot) {
            return true; // No root set, allow all
        }
        // Normalize paths and check if resolvedPath starts with root
        const normalizedPath = resolvedPath.replace(/\\/g, '/');
        const normalizedRoot = this.resolvedRoot.replace(/\\/g, '/');
        // Ensure the path is within root (add trailing slash to prevent prefix attacks)
        return (normalizedPath === normalizedRoot ||
            normalizedPath.startsWith(normalizedRoot + '/'));
    }
    /**
     * Check if path should be excluded based on glob patterns
     */
    shouldExclude(filePath) {
        if (this.options.exclude.length === 0) {
            return false;
        }
        return this.options.exclude.some((pattern) => this.matchGlob(filePath, pattern));
    }
    /**
     * Check if file matches the extension filter
     * If no extensions specified, all files match
     */
    matchesExtensions(filePath) {
        if (this.options.extensions.length === 0) {
            // No filter - accept all files that have a registered reader
            return this.registry.getReaderForPath(filePath) !== null;
        }
        // Check if file has one of the specified extensions
        const normalized = filePath.toLowerCase();
        return this.options.extensions.some((ext) => {
            const normalizedExt = ext.toLowerCase();
            const withDot = normalizedExt.startsWith('.') ? normalizedExt : `.${normalizedExt}`;
            return normalized.endsWith(withDot);
        });
    }
    /**
     * Simple glob pattern matching
     * Supports:
     * - * (matches any characters except /)
     * - ** (matches any characters including /)
     * - ? (matches single character)
     */
    matchGlob(filePath, pattern) {
        // Normalize path separators for consistent matching
        const normalized = filePath.replace(/\\/g, '/');
        const normalizedPattern = pattern.replace(/\\/g, '/');
        // Convert glob pattern to regex
        let regex = normalizedPattern
            // Escape special regex characters
            .replace(/[.+^${}()|[\]]/g, '\\$&')
            // Replace ** with temp placeholder
            .replace(/\*\*/g, '\0')
            // Replace * with [^/]*
            .replace(/\*/g, '[^/]*')
            // Replace ? with single char
            .replace(/\?/g, '.')
            // Replace temp placeholder with .*
            .replace(/\0/g, '.*');
        // Anchor pattern to start and end
        regex = `^${regex}$`;
        try {
            return new RegExp(regex).test(normalized);
        }
        catch {
            // Invalid pattern, don't exclude
            return false;
        }
    }
    /**
     * Create default registry with all available readers
     * @param maxFileSize - Optional file size limit to pass to readers
     */
    createDefaultRegistry(maxFileSize) {
        const registry = new registry_1.ReaderRegistry();
        const readerConfig = maxFileSize ? { maxFileSize } : {};
        // Import and register all available readers with file size limits
        registry.registerFileReader(new text_1.TextFileReader(readerConfig));
        registry.registerFileReader(new markdown_1.MarkdownReader(readerConfig));
        // Import other readers dynamically to avoid circular dependencies
        try {
            const { CSVReader } = require('./csv');
            registry.registerFileReader(new CSVReader(readerConfig));
        }
        catch {
            // CSV reader not available or failed to load
        }
        try {
            const { JSONReader } = require('./json');
            registry.registerFileReader(new JSONReader(readerConfig));
        }
        catch {
            // JSON reader not available or failed to load
        }
        try {
            const { HTMLReader } = require('./html');
            registry.registerFileReader(new HTMLReader(readerConfig));
        }
        catch {
            // HTML reader not available or failed to load
        }
        return registry;
    }
    /**
     * Get the current reader registry
     */
    getRegistry() {
        return this.registry;
    }
    /**
     * Get current options
     */
    getOptions() {
        return { ...this.options };
    }
}
exports.DirectoryReader = DirectoryReader;
//# sourceMappingURL=directory.js.map