/**
 * Wave 12.E-fix-2 (PRD-039 FR-002 / EVID-053 CRIT-4): hand-aligned with
 * typia-validated backend handler types in examples/m9s-example/src/services/
 * {ingest,search}/types.ts. The dead auto-emission generator (CRIT-5) was
 * deleted because no first-party consumer invoked it. Keep this file in
 * lock-step with backend handlers by hand until/unless a real typia-driven
 * generator is wired. See EVID-053 §CRIT-4 for the full pre-fix vs handler
 * drift audit trail.
 */

export interface paths {
    "/api/v1/ingest/document": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest a document into the vector store */
        post: operations["v1.ingest.document"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/search/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Vector search across ingested documents (cosine score over chunk embeddings) */
        post: operations["v1.search.query"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * `POST /api/v1/ingest/document` request body. Mirrors backend
         * `IngestDocumentRequest` in `services/ingest/types.ts`.
         */
        IngestDocumentRequest: {
            /** Stable document identifier supplied by the caller. */
            docId: string;
            /** Raw document text. */
            text: string;
            /** Optional metadata bag (passed through to the domain layer). */
            metadata?: {
                source?: string;
                tags?: string[];
                author?: string;
                createdAt?: string;
            };
            /**
             * Caller user identifier. Optional in this example so curl works
             * without an auth provider; production wiring should set
             * `auth: 'required'` on the action and use `session.user_uuid`.
             */
            userId?: string;
        };
        /**
         * `POST /api/v1/ingest/document` response body. Mirrors backend
         * `IngestDocumentResponse` in `services/ingest/types.ts`.
         *
         * In **queue mode** (REDIS_URL set + workers enabled): action returns
         * immediately with `mode='queued'`, `jobId=<bullmq id>`, `chunkCount=null`.
         * In **inline mode** (REDIS_URL not set): action runs the use case
         * synchronously and returns `mode='inline'`, `chunkCount=<final count>`.
         */
        IngestDocumentResponse: {
            /** Echoed back for client-side correlation. */
            docId: string;
            /** BullMQ job id (or a synthetic id when running in inline mode). */
            jobId: string;
            /** @enum {string} */
            mode: "queued" | "inline";
            /** Final chunk count when synchronous; null in async/queued mode. */
            chunkCount: number | null;
        };
        /**
         * `POST /api/v1/search/query` request body. Mirrors backend
         * `SearchQueryRequest` in `services/search/types.ts`.
         */
        SearchQueryRequest: {
            /** Free-form natural language query. */
            query: string;
            /** Optional override; defaults to 3 server-side. */
            topK?: number;
            /** Caller user identifier (optional). */
            userId?: string;
        };
        /**
         * `POST /api/v1/search/query` response body. Mirrors backend
         * `SearchQueryResponse` in `services/search/types.ts`.
         */
        SearchQueryResponse: {
            results: {
                docId: string;
                chunkIdx: number;
                text: string;
                score: number;
            }[];
        };
        /** RFC 9457 `application/problem+json` payload. */
        ProblemDetails: {
            /** Format: uri */
            type: string;
            title: string;
            status: number;
            detail?: string;
            instance?: string;
            details?: {
                [key: string]: unknown;
            };
            correlationId?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "v1.ingest.document": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IngestDocumentRequest"];
            };
        };
        responses: {
            /** @description Ingest accepted */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestDocumentResponse"];
                };
            };
            /** @description Validation error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Permission denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Rate-limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    "v1.search.query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SearchQueryRequest"];
            };
        };
        responses: {
            /** @description Search results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchQueryResponse"];
                };
            };
            /** @description Validation error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Permission denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Internal server error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
}
