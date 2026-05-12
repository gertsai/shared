// SPDX-License-Identifier: Apache-2.0
/**
 * OpenAIEmbedder — outbound adapter for OpenAI's `/v1/embeddings` endpoint.
 *
 * Sends a whole batch of texts in a single request (OpenAI accepts
 * `input: string[]`) and returns vectors in the same order.
 *
 * Defaults:
 *   - model: `text-embedding-3-small` (1536 dims)
 *   - baseUrl: `https://api.openai.com`
 *
 * Use `text-embedding-3-large` for 3072-dim vectors. The class latches
 * the dimensionality from the first response — callers should treat
 * `dimensions` as "best effort" before any embed() call returns.
 *
 * Wave 8.1 hardening: HTTP transport flows through
 * `@gertsai/rest-request-manager` (retry + token-bucket rate-limit + LRU
 * per-host circuit-breaker + timeout). The manager translates non-2xx
 * responses into typed `AppError` subclasses, which we map to
 * domain-specific errors with actionable hints (401 → `UnauthorizedError`
 * "check EMBEDDER_API_KEY"; 429 → `RateLimitedError` "slow down").
 * Sensitive headers (`authorization`) are redacted by the manager's
 * built-in REDACTION_KEYS chain.
 *
 * Hexagonal contract: implements {@link IEmbedder} and lives in
 * `infrastructure/`. The composition root constructs it; nothing else
 * references it directly.
 */
import { RestRequestManager } from '@gertsai/rest-request-manager';
import type { RestResponse } from '@gertsai/rest-request-manager';

import { createAppLogger } from '../composition/logger.js';
import {
  ErrorKind,
  RateLimitedError,
  UnauthorizedError,
  UpstreamFailureError,
  isAppError,
} from '../composition/errors.js';
import type { IEmbedder } from '../domain/ports/IEmbedder';

const log = createAppLogger('openai-embedder');

export interface OpenAIEmbedderOptions {
  readonly apiKey: string;
  readonly model: string;
  /** Override for OpenAI-compatible gateways (Azure, OpenRouter, etc.). */
  readonly baseUrl?: string;
  /** Per-request timeout in ms. Default 30s. */
  readonly timeoutMs?: number;
}

interface OpenAIEmbeddingsResponse {
  readonly data: ReadonlyArray<{ readonly embedding: number[]; readonly index: number }>;
  readonly model: string;
  readonly usage?: { readonly prompt_tokens: number; readonly total_tokens: number };
}

/** `text-embedding-3-small` (the documented default) emits 1536-dim vectors. */
const DEFAULT_DIMENSIONS = 1536;

function parseRps(): number {
  const raw = process.env['EMBEDDER_RATE_LIMIT_RPS'];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseBurst(): number {
  const raw = process.env['EMBEDDER_BURST'];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

/**
 * Module-level lazy singleton — one manager per embedder class shares
 * circuit-breaker / rate-limiter state across all `OpenAIEmbedder`
 * instances in a single process.
 */
let _manager: RestRequestManager | undefined;
function getManager(): RestRequestManager {
  if (_manager === undefined) {
    _manager = new RestRequestManager({
      retry: { maxAttempts: 3, baseMs: 250, jitter: 'full' },
      rateLimit: { tokensPerSecond: parseRps(), burst: parseBurst() },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
        maxHosts: 1000,
      },
      logger: log.child({ subsystem: 'http' }),
      // `authorization` is already in built-in REDACTION_KEYS but list it
      // explicitly so the manager's dispatch-log emits `[REDACTED]` even
      // if the upstream redaction set ever shrinks.
      redactRequestKeys: ['authorization'],
    });
  }
  return _manager;
}

/** @internal — test seam: reset the lazy manager so tests get fresh state. */
export function __resetOpenAIManagerForTests(): void {
  _manager = undefined;
}

export class OpenAIEmbedder implements IEmbedder {
  private _dimensions: number = DEFAULT_DIMENSIONS;
  private dimensionsLatched = false;

  constructor(private readonly opts: OpenAIEmbedderOptions) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error('OpenAIEmbedder: apiKey is required');
    }
    if (!opts.model || opts.model.trim().length === 0) {
      throw new Error('OpenAIEmbedder: model is required');
    }
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async embed(texts: ReadonlyArray<string>): Promise<number[][]> {
    if (texts.length === 0) return [];

    const baseUrl = (this.opts.baseUrl ?? 'https://api.openai.com').replace(/\/+$/u, '');
    const url = `${baseUrl}/v1/embeddings`;
    const timeoutMs = this.opts.timeoutMs ?? 30_000;

    let res: RestResponse<unknown>;
    try {
      res = await getManager().request({
        url,
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: { input: [...texts], model: this.opts.model },
        timeoutMs,
      });
    } catch (err) {
      // The manager already mapped HTTP status → typed AppError via
      // `translateHttpStatus`. Translate again here so callers receive
      // OpenAI-domain hints (env var to check, plan to upgrade) instead
      // of generic `HTTP 401 Unauthorized for https://...`. Preserve the
      // original via `.cause`.
      if (isAppError(err)) {
        if (err.kind === ErrorKind.UNAUTHORIZED) {
          throw new UnauthorizedError({
            message:
              `OpenAIEmbedder: 401 Unauthorized from ${url} — ` +
              `check EMBEDDER_API_KEY environment variable.`,
            details: { url, model: this.opts.model, upstream: 'openai' },
            cause: err,
          });
        }
        if (err.kind === ErrorKind.RATE_LIMITED) {
          throw new RateLimitedError({
            message:
              `OpenAIEmbedder: 429 Rate Limited from ${url} — ` +
              `slow down or upgrade plan.`,
            details: { url, model: this.opts.model, upstream: 'openai' },
            cause: err,
          });
        }
        // TimeoutError / UpstreamFailureError / BadGatewayError / etc.:
        // wrap with OpenAI context so callers see `upstream: 'openai'`
        // in the structured details, but preserve the kind via cause.
        throw new UpstreamFailureError({
          message: `OpenAIEmbedder: request to ${url} failed (${err.kind}) — ${err.message}`,
          details: {
            url,
            model: this.opts.model,
            upstream: 'openai',
            originalKind: err.kind,
          },
          cause: err,
        });
      }
      throw err;
    }

    const json = res.body as OpenAIEmbeddingsResponse | null;
    if (!json || !Array.isArray(json.data)) {
      throw new UpstreamFailureError({
        message:
          `OpenAIEmbedder: unexpected response shape from ${url} — ` +
          `expected { data: [...] }`,
        details: { url, model: this.opts.model, upstream: 'openai' },
      });
    }
    if (json.data.length !== texts.length) {
      throw new UpstreamFailureError({
        message:
          `OpenAIEmbedder: response count mismatch (got ${json.data.length}, ` +
          `expected ${texts.length})`,
        details: {
          url,
          model: this.opts.model,
          upstream: 'openai',
          got: json.data.length,
          expected: texts.length,
        },
      });
    }

    // OpenAI returns vectors with an `index` field — sort to be safe even
    // though the docs guarantee input-order today.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((d) => d.embedding);

    const first = vectors[0];
    if (!this.dimensionsLatched && first !== undefined && first.length > 0) {
      this._dimensions = first.length;
      this.dimensionsLatched = true;
    }
    return vectors;
  }
}
