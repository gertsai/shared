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
exports.TextFileReader = void 0;
const base_1 = require("./base");
const document_1 = require("../nodes/document");
/**
 * TextFileReader - Reads plain text files (.txt)
 *
 * Simple reader that loads text files and creates Document objects
 * with appropriate metadata for file path, name, and type.
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
class TextFileReader extends base_1.FileReader {
    supportedExtensions = ['.txt'];
    constructor(config = {}) {
        super(config);
    }
    async loadData(source) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        // SEC-001: Validate file size before reading
        await this.validateFileSize(source);
        const content = await fs.readFile(source, 'utf-8');
        const stats = await fs.stat(source);
        return [
            (0, document_1.createDocument)(content, {
                file_path: source,
                file_name: path.basename(source),
                file_type: 'text/plain',
                file_size: stats.size,
                source_type: 'file',
                created_at: stats.birthtime.toISOString(),
                modified_at: stats.mtime.toISOString(),
            }),
        ];
    }
}
exports.TextFileReader = TextFileReader;
//# sourceMappingURL=text.js.map