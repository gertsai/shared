/**
 * MetadataMode controls what metadata is included in different contexts.
 * Helps prevent embedding quality degradation and reduces LLM token usage.
 */
export declare enum MetadataMode {
    ALL = "ALL",
    EMBED = "EMBED",
    LLM = "LLM",
    NONE = "NONE"
}
export declare const DEFAULT_EXCLUDED_EMBED_KEYS: string[];
export declare const DEFAULT_EXCLUDED_LLM_KEYS: string[];
