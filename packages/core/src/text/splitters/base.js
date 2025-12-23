import { createTextNode } from '../nodes/text-node';
import { NodeRelationship } from '../relationships/types';
function linkSequentialRelationships(nodes) {
    for (let i = 0; i < nodes.length; i++) {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        const current = nodes[i];
        if (!prev && !next)
            continue;
        current.relationships ??= {};
        if (prev)
            current.relationships[NodeRelationship.PREVIOUS] = { nodeId: prev.id };
        if (next)
            current.relationships[NodeRelationship.NEXT] = { nodeId: next.id };
    }
}
export class BaseTextSplitter {
    chunkSize;
    chunkOverlap;
    keepSeparator;
    addStartIndex;
    stripWhitespace;
    lengthFunction;
    chunkMethod;
    constructor(options) {
        this.chunkSize = options.chunkSize;
        this.chunkOverlap = options.chunkOverlap ?? 0;
        this.keepSeparator = options.keepSeparator ?? false;
        this.addStartIndex = options.addStartIndex ?? false;
        this.stripWhitespace = options.stripWhitespace ?? true;
        this.lengthFunction = options.lengthFunction ?? ((text) => text.length);
        this.chunkMethod = options.chunkMethod;
        if (this.chunkSize <= 0)
            throw new Error('chunkSize must be > 0');
        if (this.chunkOverlap < 0)
            throw new Error('chunkOverlap must be >= 0');
        if (this.chunkOverlap >= this.chunkSize) {
            throw new Error('chunkOverlap must be < chunkSize');
        }
    }
    joinDocs(parts, separator) {
        const text = parts.join(separator);
        const finalText = this.stripWhitespace ? text.trim() : text;
        return finalText.length === 0 ? null : finalText;
    }
    mergeSplits(splits, separator) {
        const separatorLen = this.lengthFunction(separator);
        const docs = [];
        let currentDoc = [];
        let total = 0;
        for (const part of splits) {
            const len = this.lengthFunction(part);
            const needsSep = currentDoc.length > 0 ? separatorLen : 0;
            if (total + len + needsSep > this.chunkSize) {
                const doc = this.joinDocs(currentDoc, separator);
                if (doc !== null)
                    docs.push(doc);
                while (total > this.chunkOverlap ||
                    (total + len + (currentDoc.length > 0 ? separatorLen : 0) > this.chunkSize && total > 0)) {
                    const head = currentDoc[0] ?? '';
                    total -= this.lengthFunction(head) + (currentDoc.length > 1 ? separatorLen : 0);
                    currentDoc = currentDoc.slice(1);
                }
            }
            currentDoc.push(part);
            total += len + (currentDoc.length > 1 ? separatorLen : 0);
        }
        const doc = this.joinDocs(currentDoc, separator);
        if (doc !== null)
            docs.push(doc);
        return docs;
    }
    splitDocuments(docs) {
        const nodes = [];
        for (const doc of docs) {
            const chunks = this.splitText(doc.text);
            let searchIndex = 0;
            let previousChunkLen = 0;
            const docNodes = chunks.map((chunk, index) => {
                let startIndex = 0;
                if (this.addStartIndex) {
                    const offset = searchIndex + previousChunkLen - this.chunkOverlap;
                    const found = doc.text.indexOf(chunk, Math.max(0, offset));
                    startIndex = found >= 0 ? found : 0;
                    searchIndex = startIndex;
                    previousChunkLen = chunk.length;
                }
                else {
                    const found = doc.text.indexOf(chunk, searchIndex);
                    startIndex = found >= 0 ? found : 0;
                    searchIndex = startIndex;
                }
                const endIndex = Math.min(doc.text.length, startIndex + chunk.length);
                return createTextNode(chunk, {
                    chunk_index: index,
                    total_chunks: chunks.length,
                    chunk_method: this.chunkMethod,
                    chunk_overlap: this.chunkOverlap,
                    start_index: startIndex,
                    end_index: endIndex,
                    startCharIdx: startIndex,
                    endCharIdx: endIndex,
                    doc_id: doc.id,
                    doc_path: doc.metadata.file_path,
                    Header_1: doc.metadata.Header_1,
                    Header_2: doc.metadata.Header_2,
                    Header_3: doc.metadata.Header_3,
                    section_path: doc.metadata.section_path,
                }, undefined);
            });
            // Link sequential relationships (PREVIOUS/NEXT)
            linkSequentialRelationships(docNodes);
            // Establish SOURCE relationship to parent document
            for (const node of docNodes) {
                node.relationships ??= {};
                node.relationships[NodeRelationship.SOURCE] = { nodeId: doc.id };
            }
            nodes.push(...docNodes);
        }
        return nodes;
    }
}
