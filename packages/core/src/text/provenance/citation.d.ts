import { z } from 'zod';
/**
 * Citation - link from graph node back to source.
 * Enables transparent, explainable Graph RAG responses.
 */
export declare const CitationSchema: z.ZodObject<{
    /** Unique citation ID */
    id: z.ZodString;
    /** Source document info */
    sourceDocument: z.ZodObject<{
        id: z.ZodString;
        path: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name?: string | undefined;
        path?: string | undefined;
        url?: string | undefined;
    }, {
        id: string;
        name?: string | undefined;
        path?: string | undefined;
        url?: string | undefined;
    }>;
    /** Source chunk info */
    chunk: z.ZodObject<{
        id: z.ZodString;
        startIndex: z.ZodNumber;
        endIndex: z.ZodNumber;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        startIndex: number;
        endIndex: number;
    }, {
        id: string;
        text: string;
        startIndex: number;
        endIndex: number;
    }>;
    /** Entity being cited (optional) */
    entity: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        name: string;
    }, {
        type: string;
        id: string;
        name: string;
    }>>;
    /** Confidence of citation relevance */
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    chunk: {
        id: string;
        text: string;
        startIndex: number;
        endIndex: number;
    };
    confidence: number;
    sourceDocument: {
        id: string;
        name?: string | undefined;
        path?: string | undefined;
        url?: string | undefined;
    };
    entity?: {
        type: string;
        id: string;
        name: string;
    } | undefined;
}, {
    id: string;
    chunk: {
        id: string;
        text: string;
        startIndex: number;
        endIndex: number;
    };
    confidence: number;
    sourceDocument: {
        id: string;
        name?: string | undefined;
        path?: string | undefined;
        url?: string | undefined;
    };
    entity?: {
        type: string;
        id: string;
        name: string;
    } | undefined;
}>;
export type Citation = z.infer<typeof CitationSchema>;
