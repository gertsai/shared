// SPDX-License-Identifier: Apache-2.0
/**
 * OllamaEmbedder — outbound adapter for an Ollama-hosted embedding model.
 *
 * Thin wrapper around `POST {url}/api/embeddings` (Ollama's per-prompt
 * endpoint). Designed for local development against an Ollama daemon
 * running on `http://localhost:11434`.
 *
 * Wave 8.1 hardening: HTTP transport now flows through
 * `@gertsai/rest-request-manager` which adds retry + timeout +
 * token-bucket rate-limit + LRU per-host circuit-breaker on top of the
 * shared `@gertsai/fetch.httpCaller`. The manager translates non-2xx
 * status codes and transport failures (incl. `AbortError → TimeoutError`)
 * into typed `AppError` subclasses, so we can switch on `kind` without
 * grepping undici stack traces.
 *
 * Implementation notes:
 *   - Ollama's embeddings endpoint accepts ONE prompt per request, so we
 *     issue requests serially. For a small example workload (a handful of
 *     chunks) this is fine; production callers should batch upstream or
 *     introduce parallelism with a concurrency limit.
 *   - `dimensions` is filled from the first successful response. Until the
 *     first call returns we report a sensible default for `nomic-embed-text`
 *     (768) so callers that probe `embedder.dimensions` at startup don't
 *     get NaN.
 *   - The shared `RestRequestManager` is a module-level lazy singleton
 *     (one instance per embedder class). Construction is deferred until
 *     the first `embed()` call so the cost is paid only when the embedder
 *     is actually used.
 *
 * SSRF posture: Ollama is local-only by design. The manager forwards
 * `security: { ssrfProtection: true, allowLocalhost: true, allowPrivateNetworks: true }`
 * to `@gertsai/fetch` so the connection succeeds against
 * `http://localhost:11434` (and analogous private-network deployments).
 * SSRF protection itself remains enabled — the relaxation only opens the
 * loopback / RFC1918 allowlist that the legacy direct-`httpCaller` site
 * had configured before the Wave 8.1 manager migration.
 *
 * Hexagonal contract: implements {@link IEmbedder} and lives in
 * `infrastructure/` — application/domain layers never import this module
 * directly. The composition root in `src/composition/infrastructure.ts`
 * is the only place that constructs it.
 */
import { RestRequestManager } from '@gertsai/rest-request-manager';
import type { RestResponse } from '@gertsai/rest-request-manager';

import { createAppLogger } from '../composition/logger.js';
import { UpstreamFailureError, isAppError } from '../composition/errors.js';
import type { IEmbedder } from '../domain/ports/IEmbedder';

const log = createAppLogger('ollama-embedder');

export interface OllamaEmbedderOptions {
  /** Base URL of the Ollama daemon (e.g. `http://localhost:11434`). */
  readonly url: string;
  /** Model tag, e.g. `nomic-embed-text`, `mxbai-embed-large`. */
  readonly model: string;
  /**
   * Per-request timeout in ms. Default 30s — embeddings are typically
   * fast but a cold model load on the first call can take a while.
   */
  readonly timeoutMs?: number;
}

interface OllamaEmbeddingsResponse {
  /** Float vector. */
  readonly embedding: number[];
}

/** Conservative fallback for `nomic-embed-text` until the first call lands. */
const DEFAULT_DIMENSIONS = 768;

function parseRps(): number {
  const raw = process.env['EMBEDDER_RATE_LIMIT_RPS'];
  const parsed = raw === undefined ? NaN : Number(raw);
  // Default 10 rps — generous headroom for local-only Ollama where the
  // bottleneck is CPU/GPU, not network. Production callers metering a
  // shared upstream should override via env.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function parseBurst(): number {
  const raw = process.env['EMBEDDER_BURST'];
  const parsed = raw === undefined ? NaN : Number(raw);
  // Default burst 20 — covers a small batch of chunks landing at once
  // without throttling, while still providing a hard ceiling against
  // runaway loops. Pair with `EMBEDDER_RATE_LIMIT_RPS` to tune.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/**
 * Module-level lazy singleton. One {@link RestRequestManager} per embedder
 * class (not per instance) — circuit-breaker / rate-limiter state is shared
 * across all OllamaEmbedder instances pointing at the same daemon, which is
 * the desired behaviour for a single-process worker.
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
      // Ollama is local by design — Wave 8.1 explicitly relaxes SSRF
      // localhost / private-network allowlist (parity with the legacy
      // pre-manager call site). The manager still enforces the SSRF
      // validator; we only widen the host allowlist.
      security: {
        ssrfProtection: true,
        allowLocalhost: true,
        allowPrivateNetworks: true,
      },
    });
  }
  return _manager;
}

/** @internal — test seam: reset the lazy manager so tests get fresh state. */
export function __resetOllamaManagerForTests(): void {
  _manager = undefined;
}

export class OllamaEmbedder implements IEmbedder {
  /**
   * Mutable so we can latch onto the dimensionality returned by the first
   * successful embedding call. Subsequent responses with mismatched length
   * trigger a single warning (model misconfiguration is a soft error here).
   */
  private _dimensions: number = DEFAULT_DIMENSIONS;
  private dimensionsLatched = false;
  private warnedMismatch = false;

  constructor(private readonly opts: OllamaEmbedderOptions) {
    if (!opts.url || opts.url.trim().length === 0) {
      throw new Error('OllamaEmbedder: url is required');
    }
    if (!opts.model || opts.model.trim().length === 0) {
      throw new Error('OllamaEmbedder: model is required');
    }
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async embed(texts: ReadonlyArray<string>): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      out.push(await this.embedOne(text));
    }
    return out;
  }

  private async embedOne(prompt: string): Promise<number[]> {
    const url = `${this.opts.url.replace(/\/+$/u, '')}/api/embeddings`;
    const timeoutMs = this.opts.timeoutMs ?? 30_000;

    let res: RestResponse<unknown>;
    try {
      res = await getManager().request({
        url,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { model: this.opts.model, prompt },
        timeoutMs,
      });
    } catch (err) {
      // The manager already translated transport / non-2xx errors into
      // typed AppError subclasses (UpstreamFailureError, TimeoutError,
      // RateLimitedError, …). Wrap with embedder-domain context while
      // preserving the original via `.cause` so root-cause analysis still
      // works. For connection-refused / DNS errors we add the actionable
      // hint that historically appeared in the legacy embedder.
      if (isAppError(err)) {
        throw new UpstreamFailureError({
          message:
            `OllamaEmbedder: request to ${url} failed (${err.kind}) — ` +
            `is the Ollama daemon running and reachable? ` +
            `(model='${this.opts.model}'). Underlying: ${err.message}`,
          details: {
            url,
            model: this.opts.model,
            upstream: 'ollama',
            originalKind: err.kind,
          },
          cause: err,
        });
      }
      throw err;
    }

    const json = res.body as OllamaEmbeddingsResponse | null;
    if (!json || !Array.isArray(json.embedding) || json.embedding.length === 0) {
      throw new UpstreamFailureError({
        message:
          `OllamaEmbedder: unexpected response shape from ${url} — ` +
          `expected { embedding: number[] }`,
        details: { url, model: this.opts.model, upstream: 'ollama' },
      });
    }

    if (!this.dimensionsLatched) {
      this._dimensions = json.embedding.length;
      this.dimensionsLatched = true;
    } else if (
      json.embedding.length !== this._dimensions &&
      !this.warnedMismatch
    ) {
      this.warnedMismatch = true;
      log.warn('dimension drift', {
        firstDims: this._dimensions,
        thisDims: json.embedding.length,
        model: this.opts.model,
      });
    }

    return json.embedding;
  }
}
