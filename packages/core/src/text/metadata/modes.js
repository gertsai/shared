/**
 * MetadataMode controls what metadata is included in different contexts.
 * Helps prevent embedding quality degradation and reduces LLM token usage.
 */
export var MetadataMode;
(function (MetadataMode) {
    MetadataMode["ALL"] = "ALL";
    MetadataMode["EMBED"] = "EMBED";
    MetadataMode["LLM"] = "LLM";
    MetadataMode["NONE"] = "NONE";
})(MetadataMode || (MetadataMode = {}));
export const DEFAULT_EXCLUDED_EMBED_KEYS = [
    'file_path',
    'file_size',
    'created_at',
    'modified_at',
    'chunk_index',
    'total_chunks',
    'start_index',
    'end_index',
    'startCharIdx',
    'endCharIdx',
    'extra',
];
export const DEFAULT_EXCLUDED_LLM_KEYS = [
    'file_size',
    'startCharIdx',
    'endCharIdx',
    'chunk_overlap',
    'extra',
];
