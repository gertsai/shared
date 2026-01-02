import { type TextNode } from '../nodes/text-node';
import type { Document } from '../nodes/document';
export interface ITextSplitter {
    splitText(text: string): string[];
    splitDocuments(docs: Document[]): TextNode[];
}
export interface TextSplitterOptions {
    chunkSize: number;
    chunkOverlap?: number;
    keepSeparator?: boolean | 'start' | 'end';
    addStartIndex?: boolean;
    stripWhitespace?: boolean;
    lengthFunction?: (text: string) => number;
    chunkMethod?: TextNode['metadata']['chunk_method'];
}
export declare abstract class BaseTextSplitter implements ITextSplitter {
    protected readonly chunkSize: number;
    protected readonly chunkOverlap: number;
    protected readonly keepSeparator: boolean | 'start' | 'end';
    protected readonly addStartIndex: boolean;
    protected readonly stripWhitespace: boolean;
    protected readonly lengthFunction: (text: string) => number;
    protected readonly chunkMethod?: TextNode['metadata']['chunk_method'];
    constructor(options: TextSplitterOptions);
    abstract splitText(text: string): string[];
    protected joinDocs(parts: readonly string[], separator: string): string | null;
    protected mergeSplits(splits: Iterable<string>, separator: string): string[];
    splitDocuments(docs: Document[]): TextNode[];
}
