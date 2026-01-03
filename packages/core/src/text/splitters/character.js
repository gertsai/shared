"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CharacterTextSplitter = void 0;
const base_1 = require("./base");
/**
 * CharacterTextSplitter splits text by a single separator character or string.
 *
 * This is the simplest text splitter, useful when you have natural delimiters
 * in your text (e.g., paragraphs separated by double newlines).
 *
 * @example
 * ```typescript
 * const splitter = new CharacterTextSplitter({
 *   chunkSize: 1000,
 *   chunkOverlap: 200,
 *   separator: '\n\n'
 * });
 *
 * const chunks = splitter.splitText(text);
 * ```
 */
class CharacterTextSplitter extends base_1.BaseTextSplitter {
    separator;
    constructor(options) {
        super({ ...options, chunkMethod: 'character' });
        this.separator = options.separator ?? '\n\n';
    }
    splitText(text) {
        const splits = text.split(this.separator);
        return this.mergeSplits(splits, this.separator);
    }
}
exports.CharacterTextSplitter = CharacterTextSplitter;
//# sourceMappingURL=character.js.map