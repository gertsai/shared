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
exports.FileReader = exports.FileSizeExceededError = exports.DEFAULT_MAX_FILE_SIZE = void 0;
/**
 * Default maximum file size for readers (50MB).
 * Prevents memory exhaustion from maliciously large files.
 */
exports.DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
/**
 * Error thrown when file size exceeds the configured limit.
 */
class FileSizeExceededError extends Error {
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
exports.FileSizeExceededError = FileSizeExceededError;
class FileReader {
    maxFileSize;
    constructor(config = {}) {
        this.maxFileSize = config.maxFileSize ?? exports.DEFAULT_MAX_FILE_SIZE;
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
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const stats = await fs.stat(filePath);
        if (stats.size > this.maxFileSize) {
            throw new FileSizeExceededError(filePath, stats.size, this.maxFileSize);
        }
        return stats.size;
    }
}
exports.FileReader = FileReader;
//# sourceMappingURL=base.js.map