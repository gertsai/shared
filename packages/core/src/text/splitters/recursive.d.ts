import { BaseTextSplitter } from './base';
export declare const DEFAULT_SEPARATORS: string[];
export type KeepSeparator = 'start' | 'end' | false;
export interface RecursiveSplitterOptions {
    separators?: string[];
    keepSeparator?: KeepSeparator;
}
export declare class RecursiveCharacterTextSplitter extends BaseTextSplitter {
    private readonly separators;
    private readonly keepSeparatorMode;
    constructor(options: {
        chunkSize: number;
        chunkOverlap?: number;
    } & RecursiveSplitterOptions);
    splitText(text: string): string[];
    private splitTextRecursively;
}
//# sourceMappingURL=recursive.d.ts.map