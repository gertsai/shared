"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentSchema = exports.DocumentMetadataSchema = void 0;
exports.createDocument = createDocument;
const zod_1 = require("zod");
const ids_1 = require("../../ids");
exports.DocumentMetadataSchema = zod_1.z
    .object({
    file_path: zod_1.z.string().optional(),
    file_name: zod_1.z.string().optional(),
    file_type: zod_1.z.string().optional(),
    file_size: zod_1.z.number().optional(),
    Header_1: zod_1.z.string().optional(),
    Header_2: zod_1.z.string().optional(),
    Header_3: zod_1.z.string().optional(),
    section_path: zod_1.z.string().optional(),
    source_type: zod_1.z.enum(['file', 'url', 'stream', 'memory']).optional(),
    url: zod_1.z.string().url().optional(),
    created_at: zod_1.z.string().datetime().optional(),
    modified_at: zod_1.z.string().datetime().optional(),
    extra: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
})
    .passthrough();
exports.DocumentSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
    metadata: exports.DocumentMetadataSchema.default({}),
    embedding: zod_1.z.array(zod_1.z.number()).optional(),
});
function createDocument(text, metadata) {
    return {
        id: (0, ids_1.createId)('doc'),
        text,
        metadata: { ...(metadata ?? {}) },
    };
}
//# sourceMappingURL=document.js.map