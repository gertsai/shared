import { BaseTextSplitter } from './base';
export declare const ABBREVIATIONS: Record<string, readonly string[]>;
export interface SentenceSplitterOptions {
    language?: string;
    abbreviations?: readonly string[];
}
export declare class SentenceSplitter extends BaseTextSplitter {
    private readonly abbreviations;
    constructor(options: {
        chunkSize: number;
        chunkOverlap?: number;
    } & SentenceSplitterOptions);
    splitText(text: string): string[];
}
//# sourceMappingURL=sentence.d.ts.map