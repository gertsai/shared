"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextNodeSchema = exports.TextNodeRelatedNodeInfoSchema = exports.TextNodeMetadataSchema = void 0;
exports.createTextNode = createTextNode;
const zod_1 = require("zod");
const ids_1 = require("../../ids");
exports.TextNodeMetadataSchema = zod_1.z
    .object({
    chunk_index: zod_1.z.number().int().min(0),
    total_chunks: zod_1.z.number().int().min(1).optional(),
    chunk_method: zod_1.z
        .enum(['character', 'recursive', 'sentence', 'token', 'markdown', 'html', 'code', 'semantic'])
        .optional(),
    chunk_overlap: zod_1.z.number().int().min(0).optional(),
    start_index: zod_1.z.number().int().min(0),
    end_index: zod_1.z.number().int().min(0).optional(),
    startCharIdx: zod_1.z.number().int().min(0).optional(),
    endCharIdx: zod_1.z.number().int().min(0).optional(),
    doc_id: zod_1.z.string(),
    doc_path: zod_1.z.string().optional(),
    Header_1: zod_1.z.string().optional(),
    Header_2: zod_1.z.string().optional(),
    Header_3: zod_1.z.string().optional(),
    section_path: zod_1.z.string().optional(),
})
    .passthrough();
exports.TextNodeRelatedNodeInfoSchema = zod_1.z.object({
    nodeId: zod_1.z.string(),
    nodeType: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.TextNodeSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
    metadata: exports.TextNodeMetadataSchema,
    embedding: zod_1.z.array(zod_1.z.number()).optional(),
    relationships: zod_1.z.record(zod_1.z.string(), exports.TextNodeRelatedNodeInfoSchema).optional(),
});
function createTextNode(text, metadata, relationships) {
    return {
        id: (0, ids_1.createId)('chunk'),
        text,
        metadata,
        relationships,
    };
}
//# sourceMappingURL=text-node.js.map