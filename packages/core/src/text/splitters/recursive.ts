import { BaseTextSplitter } from './base';

export const DEFAULT_SEPARATORS = ['\n\n', '\n', ' ', ''];

export type KeepSeparator = 'start' | 'end' | false;

export interface RecursiveSplitterOptions {
  separators?: string[];
  keepSeparator?: KeepSeparator;
}

function splitByFixedSize(text: string, chunkSize: number): string[] {
  const splits: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    splits.push(text.slice(i, i + chunkSize));
  }
  return splits.filter((s) => s.length > 0);
}

function splitTextWithSeparator(
  text: string,
  separator: string,
  keepSeparator: KeepSeparator
): string[] {
  if (!separator) return text.split('').filter((s) => s.length > 0);

  if (keepSeparator === false) {
    return text.split(separator).filter((s) => s.length > 0);
  }

  const result: string[] = [];
  let cursor = 0;

  while (true) {
    const nextIndex = text.indexOf(separator, cursor);
    if (nextIndex === -1) break;

    const before = text.slice(cursor, nextIndex);
    const sepText = text.slice(nextIndex, nextIndex + separator.length);

    if (keepSeparator === 'end') {
      const segment = before + sepText;
      if (segment) result.push(segment);
      cursor = nextIndex + separator.length;
      continue;
    }

    // keepSeparator === 'start'
    if (before) result.push(before);
    cursor = nextIndex; // include separator in next segment
  }

  if (cursor < text.length) {
    result.push(text.slice(cursor));
  }

  return result.filter((s) => s.length > 0);
}

function chooseSeparator(text: string, separators: string[]): string {
  for (const separator of separators) {
    if (separator === '') return '';
    if (text.includes(separator)) return separator;
  }
  return separators.at(-1) ?? '';
}

export class RecursiveCharacterTextSplitter extends BaseTextSplitter {
  private readonly separators: string[];
  private readonly keepSeparatorMode: KeepSeparator;

  constructor(
    options: {
      chunkSize: number;
      chunkOverlap?: number;
    } & RecursiveSplitterOptions
  ) {
    super({
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
      chunkMethod: 'recursive',
      keepSeparator: options.keepSeparator ?? false,
      addStartIndex: true,
    });
    this.separators = options.separators ?? DEFAULT_SEPARATORS;
    this.keepSeparatorMode = options.keepSeparator ?? false;
  }

  splitText(text: string): string[] {
    return this.splitTextRecursively(text, this.separators);
  }

  private splitTextRecursively(text: string, separators: string[]): string[] {
    if (text.length <= this.chunkSize) return [text];
    if (separators.length === 0) return splitByFixedSize(text, this.chunkSize);

    const separator = chooseSeparator(text, separators);
    const separatorIndex = Math.max(0, separators.indexOf(separator));
    const nextSeparators = separators.slice(separatorIndex + 1);

    const splits = splitTextWithSeparator(text, separator, this.keepSeparatorMode);
    const docs: string[] = [];
    let goodSplits: string[] = [];

    const shouldMergeWithoutSeparator = this.keepSeparatorMode !== false;
    const mergeSeparator = shouldMergeWithoutSeparator ? '' : separator;

    for (const split of splits) {
      if (this.lengthFunction(split) < this.chunkSize) {
        goodSplits.push(split);
        continue;
      }

      if (goodSplits.length > 0) {
        docs.push(...this.mergeSplits(goodSplits, mergeSeparator));
        goodSplits = [];
      }

      if (nextSeparators.length > 0) {
        docs.push(...this.splitTextRecursively(split, nextSeparators));
      } else {
        docs.push(split);
      }
    }

    if (goodSplits.length > 0) {
      docs.push(...this.mergeSplits(goodSplits, mergeSeparator));
    }

    return docs;
  }
}
