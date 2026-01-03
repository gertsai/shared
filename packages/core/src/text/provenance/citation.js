"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CitationSchema = void 0;
const zod_1 = require("zod");
/**
 * Citation - link from graph node back to source.
 * Enables transparent, explainable Graph RAG responses.
 */
exports.CitationSchema = zod_1.z.object({
    /** Unique citation ID */
    id: zod_1.z.string(),
    /** Source document info */
    sourceDocument: zod_1.z.object({
        id: zod_1.z.string(),
        path: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        url: zod_1.z.string().url().optional(),
    }),
    /** Source chunk info */
    chunk: zod_1.z.object({
        id: zod_1.z.string(),
        startIndex: zod_1.z.number(),
        endIndex: zod_1.z.number(),
        text: zod_1.z.string(),
    }),
    /** Entity being cited (optional) */
    entity: zod_1.z
        .object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        type: zod_1.z.string(),
    })
        .optional(),
    /** Confidence of citation relevance */
    confidence: zod_1.z.number().min(0).max(1),
});
//# sourceMappingURL=citation.js.map