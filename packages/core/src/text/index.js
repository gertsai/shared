"use strict";
/**
 * @gerts/core - Text Processing Core
 * Phase 22: Text Processing
 * Phase 23: Entity Extraction & Deduplication
 *
 * Exports:
 * - Document and TextNode types
 * - Metadata modes + filtering
 * - Relationship enums/types
 * - Text splitters
 * - Document reader interfaces + registry
 * - Output parsers (Zod)
 * - Entity extraction schemas and types
 * - Deduplication strategies
 * - Provenance tracking and citations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./nodes"), exports);
__exportStar(require("./metadata"), exports);
__exportStar(require("./relationships"), exports);
__exportStar(require("./splitters"), exports);
__exportStar(require("./readers"), exports);
__exportStar(require("./parsers"), exports);
__exportStar(require("./extraction/schemas"), exports);
__exportStar(require("./deduplication"), exports);
__exportStar(require("./provenance"), exports);
//# sourceMappingURL=index.js.map