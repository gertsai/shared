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
export class CharacterTextSplitter extends BaseTextSplitter {
  private readonly separator: string;

  constructor(options: CharacterTextSplitterOptions) {
    super({ ...options, chunkMethod: 'character' });
    this.separator = options.separator ?? '\n\n';
  }

  splitText(text: string): string[] {
    const splits = text.split(this.separator);
    return this.mergeSplits(splits, this.separator);
  }
}
