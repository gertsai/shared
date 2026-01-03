"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterMetadata = filterMetadata;
const modes_1 = require("./modes");
function filterMetadata(metadata, mode, options) {
    if (mode === modes_1.MetadataMode.ALL)
        return { ...metadata };
    if (mode === modes_1.MetadataMode.NONE)
        return {};
    const excluded = mode === modes_1.MetadataMode.EMBED
        ? options?.excludedEmbedKeys ?? modes_1.DEFAULT_EXCLUDED_EMBED_KEYS
        : options?.excludedLLMKeys ?? modes_1.DEFAULT_EXCLUDED_LLM_KEYS;
    const excludedSet = new Set(excluded);
    const result = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (excludedSet.has(key))
            continue;
        result[key] = value;
    }
    return result;
}
//# sourceMappingURL=filter.js.map