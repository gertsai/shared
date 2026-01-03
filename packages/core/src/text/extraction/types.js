"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractionResultSchema = void 0;
const zod_1 = require("zod");
const schemas_1 = require("./schemas");
/**
 * ExtractionResult - output of entity extraction.
 * Contains entities, relationships, and processing metadata.
 */
exports.ExtractionResultSchema = zod_1.z.object({
    /** Extracted entities */
    entities: zod_1.z.array(schemas_1.EntitySchema),
    /** Extracted triplets (relationships) */
    triplets: zod_1.z.array(schemas_1.TripletSchema),
    /** Processing metadata */
    metadata: zod_1.z.object({
        /** Time to process (ms) */
        processingTimeMs: zod_1.z.number(),
        /** Tokens used (if LLM-based) */
        tokensUsed: zod_1.z.number().optional(),
        /** Model used (if LLM-based) */
        modelUsed: zod_1.z.string().optional(),
        /** Source chunk ID */
        chunkId: zod_1.z.string(),
        /** Extractor version */
        extractorVersion: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=types.js.map