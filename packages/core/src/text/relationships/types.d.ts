export declare enum NodeRelationship {
    PREVIOUS = "PREVIOUS",
    NEXT = "NEXT",
    PARENT = "PARENT",
    CHILD = "CHILD",
    SOURCE = "SOURCE",
    SIMILAR = "SIMILAR",
    REFERENCES = "REFERENCES",
    CONTRADICTS = "CONTRADICTS",
    SUPPORTS = "SUPPORTS"
}
export interface RelatedNodeInfo {
    nodeId: string;
    nodeType?: string;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map