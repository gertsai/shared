import { FileReader, type FileReaderConfig } from './base';
import { createDocument, type Document } from '../nodes/document';

/**
 * TextFileReader - Reads plain text files (.txt)
 *
 * Simple reader that loads text files and creates Document objects
 * with appropriate metadata for file path, name, and type.
 *
 * Security: Validates file size before reading to prevent memory exhaustion.
 */
export class TextFileReader extends FileReader {
  readonly supportedExtensions = ['.txt'] as const;

  constructor(config: FileReaderConfig = {}) {
    super(config);
  }

  async loadData(source: string): Promise<Document[]> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // SEC-001: Validate file size before reading
    await this.validateFileSize(source);

    const content = await fs.readFile(source, 'utf-8');
    const stats = await fs.stat(source);

    return [
      createDocument(content, {
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
