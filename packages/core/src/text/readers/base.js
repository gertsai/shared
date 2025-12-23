/**
 * Default maximum file size for readers (50MB).
 * Prevents memory exhaustion from maliciously large files.
 */
export const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
/**
 * Error thrown when file size exceeds the configured limit.
 */
export class FileSizeExceededError extends Error {
    filePath;
    fileSize;
    maxSize;
    constructor(filePath, fileSize, maxSize) {
        super(`File size ${fileSize} bytes exceeds maximum allowed size of ${maxSize} bytes: ${filePath}`);
        this.filePath = filePath;
        this.fileSize = fileSize;
        this.maxSize = maxSize;
        this.name = 'FileSizeExceededError';
    }
}
export class FileReader {
    maxFileSize;
    constructor(config = {}) {
        this.maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    }
    canRead(source) {
        const normalized = source.toLowerCase();
        return this.supportedExtensions.some((ext) => normalized.endsWith(ext.toLowerCase()));
    }
    /**
     * Validate file size before reading.
     * @throws FileSizeExceededError if file is too large
     */
    async validateFileSize(filePath) {
        const fs = await import('fs/promises');
        const stats = await fs.stat(filePath);
        if (stats.size > this.maxFileSize) {
            throw new FileSizeExceededError(filePath, stats.size, this.maxFileSize);
        }
        return stats.size;
    }
}
