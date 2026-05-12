export const LANGUAGE_SEPARATORS: Record<string, string[]> = {
  en: ['\n\n', '\n', ' ', ''],
  ru: ['\n\n', '\n', ' ', ''],
  de: ['\n\n', '\n', ' ', ''],
  fr: ['\n\n', '\n', ' ', ''],
  es: ['\n\n', '\n', ' ', ''],
  it: ['\n\n', '\n', ' ', ''],
  pt: ['\n\n', '\n', ' ', ''],
  nl: ['\n\n', '\n', ' ', ''],
  sv: ['\n\n', '\n', ' ', ''],
  no: ['\n\n', '\n', ' ', ''],
  da: ['\n\n', '\n', ' ', ''],
  fi: ['\n\n', '\n', ' ', ''],
  pl: ['\n\n', '\n', ' ', ''],
  cs: ['\n\n', '\n', ' ', ''],
  sk: ['\n\n', '\n', ' ', ''],
  hu: ['\n\n', '\n', ' ', ''],
  ro: ['\n\n', '\n', ' ', ''],
  bg: ['\n\n', '\n', ' ', ''],
  uk: ['\n\n', '\n', ' ', ''],
  tr: ['\n\n', '\n', ' ', ''],
  ar: ['\n\n', '\n', ' ', ''],
  he: ['\n\n', '\n', ' ', ''],
  hi: ['\n\n', '\n', ' ', ''],
  zh: ['\n\n', '\n', '。', '！', '？', ' ', ''],
  ja: ['\n\n', '\n', '。', '！', '？', ' ', ''],
  ko: ['\n\n', '\n', '。', '！', '？', ' ', ''],
};

const DEFAULT_LANGUAGE = 'en';

function normalizeLanguage(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0] ?? DEFAULT_LANGUAGE;
}

export function getSeparatorsForLanguage(lang: string): string[] {
  const key = normalizeLanguage(lang);
  return LANGUAGE_SEPARATORS[key] ?? LANGUAGE_SEPARATORS[DEFAULT_LANGUAGE] ?? [];
}

