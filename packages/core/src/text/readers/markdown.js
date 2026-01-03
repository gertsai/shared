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
exports.MarkdownReader = void 0;
const base_1 = require("./base");
const document_1 = require("../nodes/document");
/**
 * MarkdownReader - Reads Markdown files (.md, .markdown)
 *
 * Features:
 * - YAML frontmatter extraction and parsing
 * - Automatic title extraction from first H1 or frontmatter
 * - File metadata (path, size, timestamps)
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
class MarkdownReader extends base_1.FileReader {
    supportedExtensions = ['.md', '.markdown'];
    constructor(config = {}) {
        super(config);
    }
    async loadData(source) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        // SEC-001: Validate file size before reading
        await this.validateFileSize(source);
        const rawContent = await fs.readFile(source, 'utf-8');
        const stats = await fs.stat(source);
        const frontmatter = this.extractFrontmatter(rawContent);
        const content = this.removeFrontmatter(rawContent);
        const title = this.extractTitle(content, frontmatter);
        const metadata = {
            file_path: source,
            file_name: path.basename(source),
            file_type: 'text/markdown',
            file_size: stats.size,
            source_type: 'file',
            created_at: stats.birthtime.toISOString(),
            modified_at: stats.mtime.toISOString(),
            extra: {
                ...frontmatter,
                ...(title && { title }),
            },
        };
        return [(0, document_1.createDocument)(content, metadata)];
    }
    /**
     * Extract YAML frontmatter from markdown content
     * Frontmatter is delimited by --- at start and end
     */
    extractFrontmatter(content) {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
        const match = content.match(frontmatterRegex);
        if (!match || !match[1]) {
            return {};
        }
        const metadata = {};
        const lines = match[1].split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1)
                continue;
            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (key && value) {
                metadata[key] = value;
            }
        }
        return metadata;
    }
    /**
     * Remove frontmatter from content, returning clean markdown
     * Handles both empty frontmatter (---\n---) and populated frontmatter
     */
    removeFrontmatter(content) {
        // Match frontmatter: --- followed by optional content, then ---
        // The [\s\S]*? handles both empty and non-empty frontmatter
        return content.replace(/^---\n(?:[\s\S]*?\n)?---\n?/, '').trim();
    }
    /**
     * Extract title from first H1 heading or frontmatter title field
     */
    extractTitle(content, frontmatter) {
        // Check frontmatter first
        if (frontmatter.title) {
            return frontmatter.title;
        }
        // Look for first H1 heading
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match?.[1]) {
            return h1Match[1].trim();
        }
        return null;
    }
}
exports.MarkdownReader = MarkdownReader;
//# sourceMappingURL=markdown.js.map