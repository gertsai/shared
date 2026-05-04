import type { IDocumentReader, FileReader } from './base';

function normalizeExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/**
 * ReaderRegistry - Central registry for document readers
 *
 * Manages registration and lookup of document readers by file extension.
 * Provides methods to:
 * - Register readers for specific extensions
 * - Look up readers by extension
 * - List all registered readers and extensions
 */
export class ReaderRegistry {
  private readonly readersByExtension = new Map<string, IDocumentReader>();
  private readonly registeredReaders = new Set<IDocumentReader>();

  /**
   * Register a reader for specific file extensions
   * @throws Error if extension already has a registered reader
   */
  register(reader: IDocumentReader, extensions: readonly string[]): void {
    for (const ext of extensions) {
      const normalized = normalizeExtension(ext);
      if (!normalized) continue;
      if (this.readersByExtension.has(normalized)) {
        throw new Error(`Reader already registered for extension '${normalized}'`);
      }
      this.readersByExtension.set(normalized, reader);
    }
    this.registeredReaders.add(reader);
  }

  /**
   * Register a FileReader using its supportedExtensions property
   */
  registerFileReader(reader: FileReader): void {
    this.register(reader, reader.supportedExtensions);
  }

  /**
   * Get reader for a specific file extension
   */
  getReaderForExtension(ext: string): IDocumentReader | null {
    const normalized = normalizeExtension(ext);
    if (!normalized) return null;
    return this.readersByExtension.get(normalized) ?? null;
  }

  /**
   * Get reader for a file path (extracts extension automatically)
   */
  getReaderForPath(filePath: string): IDocumentReader | null {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return null;
    const ext = filePath.slice(lastDot);
    return this.getReaderForExtension(ext);
  }

  /**
   * List all unique registered readers
   */
  listReaders(): IDocumentReader[] {
    return [...this.registeredReaders];
  }

  /**
   * List all registered file extensions
   */
  listExtensions(): string[] {
    return [...this.readersByExtension.keys()];
  }

  /**
   * Check if a reader exists for the given extension
   */
  hasReaderForExtension(ext: string): boolean {
    return this.getReaderForExtension(ext) !== null;
  }

  /**
   * Get the number of registered readers
   */
  get size(): number {
    return this.registeredReaders.size;
  }

  /**
   * Clear all registered readers
   */
  clear(): void {
    this.readersByExtension.clear();
    this.registeredReaders.clear();
  }
}

