import { DEFAULT_EXCLUDED_EMBED_KEYS, DEFAULT_EXCLUDED_LLM_KEYS, MetadataMode, } from './modes';
export function filterMetadata(metadata, mode, options) {
    if (mode === MetadataMode.ALL)
        return { ...metadata };
    if (mode === MetadataMode.NONE)
        return {};
    const excluded = mode === MetadataMode.EMBED
        ? options?.excludedEmbedKeys ?? DEFAULT_EXCLUDED_EMBED_KEYS
        : options?.excludedLLMKeys ?? DEFAULT_EXCLUDED_LLM_KEYS;
    const excludedSet = new Set(excluded);
    const result = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (excludedSet.has(key))
            continue;
        result[key] = value;
    }
    return result;
}
