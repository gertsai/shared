import { FileReader, type FileReaderConfig } from './base';
import { type Document } from '../nodes/document';
/**
 * TextFileReader - Reads plain text files (.txt)
 *
 * Simple reader that loads text files and creates Document objects
 * with appropriate metadata for file path, name, and type.
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
export declare class TextFileReader extends FileReader {
    readonly supportedExtensions: readonly [".txt"];
    constructor(config?: FileReaderConfig);
    loadData(source: string): Promise<Document[]>;
}
