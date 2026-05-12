import { BaseTextSplitter } from './base';

export const ABBREVIATIONS: Record<string, readonly string[]> = {
  en: [
    'Mr.',
    'Mrs.',
    'Ms.',
    'Dr.',
    'Prof.',
    'Sr.',
    'Jr.',
    'St.',
    'vs.',
    'etc.',
    'Inc.',
    'Ltd.',
    'Corp.',
    'Co.',
    'i.e.',
    'e.g.',
    'a.m.',
    'p.m.',
    'Ph.D.',
    'M.D.',
    'B.A.',
    'M.A.',
  ],
  es: ['Sr.', 'Sra.', 'Srta.', 'Dr.', 'Dra.', 'Prof.', 'etc.'],
  de: ['Hr.', 'Fr.', 'Dr.', 'Prof.', 'z.B.', 'u.a.', 'etc.'],
  fr: ['M.', 'Mme.', 'Dr.', 'Pr.', 'etc.'],
};

export interface SentenceSplitterOptions {
  language?: string;
  abbreviations?: readonly string[];
}

function normalizeLanguage(lang: string | undefined): string {
  if (!lang) return 'en';
  return lang.toLowerCase().split(/[-_]/)[0] ?? 'en';
}

function getAbbreviationSet(options: SentenceSplitterOptions | undefined): Set<string> {
  const language = normalizeLanguage(options?.language);
  const base = ABBREVIATIONS[language] ?? ABBREVIATIONS.en ?? [];
  const extras = options?.abbreviations ?? [];
  return new Set([...base, ...extras]);
}

function looksLikeAbbreviation(text: string, dotIndex: number, abbreviations: Set<string>): boolean {
  const start = Math.max(0, text.lastIndexOf(' ', dotIndex - 1) + 1);
  const token = text.slice(start, dotIndex + 1);
  return abbreviations.has(token);
}

function splitByFixedSize(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.filter((s) => s.length > 0);
}

function splitSentences(text: string, abbreviations: Set<string>): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isSentenceEnd = ch === '.' || ch === '!' || ch === '?';
    if (!isSentenceEnd) continue;

    if (ch === '.' && looksLikeAbbreviation(text, i, abbreviations)) continue;
    if (ch === '.' && i > 0 && /\d/.test(text[i - 1]!) && i + 1 < text.length && /\d/.test(text[i + 1]!)) {
      continue; // decimal numbers like 3.14
    }

    let end = i + 1;
    while (end < text.length && /\s/.test(text[end]!)) end++;

    const sentenceText = text.slice(start, end);
    if (sentenceText) sentences.push(sentenceText);
    start = end;
    i = end - 1;
  }

  if (start < text.length) {
    const tail = text.slice(start);
    if (tail) sentences.push(tail);
  }

  return sentences.filter((s) => s.length > 0);
}

export class SentenceSplitter extends BaseTextSplitter {
  private readonly abbreviations: Set<string>;

  constructor(
    options: {
      chunkSize: number;
      chunkOverlap?: number;
    } & SentenceSplitterOptions
  ) {
    super({
      chunkSize: options.chunkSize,
      chunkMethod: 'sentence',
      addStartIndex: true,
      ...(options.chunkOverlap !== undefined && { chunkOverlap: options.chunkOverlap }),
    });
    this.abbreviations = getAbbreviationSet(options);
  }

  splitText(text: string): string[] {
    const sentences = splitSentences(text, this.abbreviations).flatMap((sentence) => {
      if (this.lengthFunction(sentence) <= this.chunkSize) return [sentence];
      return splitByFixedSize(sentence, this.chunkSize);
    });

    return this.mergeSplits(sentences, '');
  }
}
