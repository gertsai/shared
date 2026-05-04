import {
  DEFAULT_EXCLUDED_EMBED_KEYS,
  DEFAULT_EXCLUDED_LLM_KEYS,
  MetadataMode,
} from './modes';

export interface FilterMetadataOptions {
  excludedEmbedKeys?: readonly string[];
  excludedLLMKeys?: readonly string[];
}

export function filterMetadata(
  metadata: Record<string, unknown>,
  mode: MetadataMode,
  options?: FilterMetadataOptions
): Record<string, unknown> {
  if (mode === MetadataMode.ALL) return { ...metadata };
  if (mode === MetadataMode.NONE) return {};

  const excluded =
    mode === MetadataMode.EMBED
      ? options?.excludedEmbedKeys ?? DEFAULT_EXCLUDED_EMBED_KEYS
      : options?.excludedLLMKeys ?? DEFAULT_EXCLUDED_LLM_KEYS;

  const excludedSet = new Set(excluded);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (excludedSet.has(key)) continue;
    result[key] = value;
  }

  return result;
}

