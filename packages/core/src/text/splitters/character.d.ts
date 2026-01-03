import { BaseTextSplitter, type TextSplitterOptions } from './base';
export interface CharacterTextSplitterOptions extends TextSplitterOptions {
    separator?: string;
}
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
export declare class CharacterTextSplitter extends BaseTextSplitter {
    private readonly separator;
    constructor(options: CharacterTextSplitterOptions);
    splitText(text: string): string[];
}
//# sourceMappingURL=character.d.ts.map