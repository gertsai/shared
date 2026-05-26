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
import pLimit from 'p-limit';
import { RestRequestManager } from '@gertsai/rest-request-manager';
import type { RestResponse } from '@gertsai/rest-request-manager';
// Wave 37.C (PRD-071 — llm-costs, C-δ) — branded TenantId for embedder
// concrete-impl options (port IEmbedder unchanged). Matches the brand the
// Postgres repos already require after Phase B (FR-B2/B3).
import type { TenantId } from '@gertsai/tenant';

import { createAppLogger } from '../shared/logger';
import { UpstreamFailureError, isAppError } from '@gertsai/errors';
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
  /**
   * Wave 8.3 audit Arch#4 — optional injected {@link RestRequestManager}.
   *
   * When provided, the embedder routes ALL HTTP traffic through this
   * instance, bypassing the module-level lazy per-hostname Map. The
   * composition root builds a configured manager (retry + rate-limit +
   * circuit-breaker + SSRF allowlist scoped to the parsed URL hostname)
   * and injects it here, so the embedder no longer reaches into
   * environment-driven globals for its transport policy.
   *
   * When absent, the embedder falls back to the existing per-hostname
   * lazy Map — preserving backwards compatibility for callers that have
   * not yet migrated to constructor-injection.
   */
  readonly manager?: RestRequestManager;
  /**
   * Wave 37.C (PRD-071 — llm-costs, C-δ) — branded tenant id stamped onto
   * every emitted symbolic cost event. Required at the concrete-impl
   * boundary so the type system catches plain-string regressions at
   * compile time; matches the brand already enforced by
   * `PgDocumentRepository` + `PgVectorStore` constructors after Phase B
   * (FR-B2/B3). m9s is single-tenant-per-process by design — the
   * composition root supplies the process-level brand once at startup.
   */
  readonly tenantId: TenantId;
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
 * Wave 8.3 audit Perf#1 — bounded concurrency parser for `embed()`.
 *
 * Default 4 matches a warm `nomic-embed-text` model on commodity hardware
 * (each call ≈10–80ms, so 4 in flight saturates one model worker without
 * fighting). Raise via `EMBEDDER_CONCURRENCY` for batched workloads with
 * low per-call latency; lower for cold-start scenarios where parallel
 * calls would otherwise fight for model load.
 */
function parseConcurrency(): number {
  const raw = process.env['EMBEDDER_CONCURRENCY'];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4;
}

/**
 * Per-hostname lazy manager cache. One {@link RestRequestManager} per
 * distinct Ollama daemon host — circuit-breaker / rate-limiter state is
 * shared across all OllamaEmbedder instances pointing at the same host.
 *
 * Wave 8.2 audit Sec#1 (CWE-918): the manager's SSRF allowlist is now
 * tightened to `allowedHostnames: [hostname]` per parsed `opts.url`,
 * so even with `allowLocalhost: true / allowPrivateNetworks: true`
 * the embedder can only reach the configured target host — not arbitrary
 * RFC1918 / loopback services like AWS metadata, internal Consul, etc.
 *
 * Wave 8.3 audit Arch#4: this Map is now a FALLBACK for legacy callers
 * that don't pass `opts.manager`. The composition root is expected to
 * inject a fully-configured manager so this Map stays empty in the
 * normal startup path.
 */
const _managers = new Map<string, RestRequestManager>();
function getManager(hostname: string, override?: RestRequestManager): RestRequestManager {
  // Wave 8.3 audit Arch#4 — DI ctor opt wins over the lazy Map. This is
  // the path exercised by the production composition root.
  if (override !== undefined) return override;
  let mgr = _managers.get(hostname);
  if (mgr === undefined) {
    mgr = new RestRequestManager({
      retry: { maxAttempts: 3, baseMs: 250, jitter: 'full' },
      rateLimit: { tokensPerSecond: parseRps(), burst: parseBurst() },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
        maxHosts: 1000,
      },
      logger: log.child({ subsystem: 'http', host: hostname }),
      // Wave 8.1 relaxed SSRF allowlist for local Ollama; Wave 8.2 (audit
      // Sec#1) narrows it back to ONLY the configured hostname so that
      // attacker-controlled EMBEDDER_URL cannot pivot to other RFC1918 /
      // loopback services.
      security: {
        ssrfProtection: true,
        allowLocalhost: true,
        allowPrivateNetworks: true,
        allowedHostnames: [hostname],
      },
    });
    _managers.set(hostname, mgr);
  }
  return mgr;
}

/** @internal — test seam: reset all lazy managers so tests get fresh state. */
export function __resetOllamaManagerForTests(): void {
  _managers.clear();
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

  /**
   * Hostname parsed from `opts.url` in the constructor. Reused on every
   * `embed()` call to pick the per-host {@link RestRequestManager} and
   * to inform the SSRF allowlist (Wave 8.2 audit Sec#1, CWE-918).
   */
  private readonly _hostname: string;

  constructor(private readonly opts: OllamaEmbedderOptions) {
    if (!opts.url || opts.url.trim().length === 0) {
      throw new Error('OllamaEmbedder: url is required');
    }
    if (!opts.model || opts.model.trim().length === 0) {
      throw new Error('OllamaEmbedder: model is required');
    }
    // Wave 37.C (PRD-071 — llm-costs, C-δ) — TenantId brand provides
    // compile-time safety; runtime non-empty check guards against
    // accidental cast-then-empty at composition boundaries.
    if (typeof opts.tenantId !== 'string' || opts.tenantId.length === 0) {
      throw new Error('OllamaEmbedder: tenantId is required (branded TenantId)');
    }
    // Validate URL early — reject bad protocol / unparseable input rather
    // than letting it surface as a runtime SSRF reject deep in @gertsai/fetch.
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      throw new Error(`OllamaEmbedder: invalid url '${opts.url}' — must be a valid http(s) URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `OllamaEmbedder: unsupported protocol '${parsed.protocol}' in '${opts.url}' — must be http or https`,
      );
    }
    this._hostname = parsed.hostname;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async embed(texts: ReadonlyArray<string>): Promise<number[][]> {
    // Wave 8.2 audit Logic#1 — symmetry with OpenAIEmbedder.embed().
    // Short-circuits before any manager/network setup, and prevents a
    // future post-loop access of `out[0]!` from crashing on the empty case.
    if (texts.length === 0) return [];

    // Wave 8.3 audit Perf#1 — bounded parallelism replaces the previous
    // serial `for ... await embedOne(text)` loop. Ollama's `/api/embeddings`
    // is per-prompt, but the daemon happily services several in flight
    // (one model worker per process can interleave CPU/GPU). `p-limit`
    // guarantees that the i-th promise in the returned array resolves to
    // the embedding of `texts[i]`, so order is preserved without an
    // explicit `index` field round-trip.
    const limit = pLimit(parseConcurrency());
    const vectors = await Promise.all(
      texts.map((text) => limit(() => this.embedOne(text))),
    );

    // Wave 37.C (PRD-071 — llm-costs) — symbolic cost event (Ollama local,
    // USD=0; tokens estimated via length/4). Ollama's `/api/embeddings`
    // returns no `usage` field — we approximate the input token count with
    // a length/4 heuristic (~4 chars/token, the canonical
    // English-text-on-BPE estimate). Same event shape as OpenAIEmbedder
    // so a single downstream consumer can ingest both providers.
    this.emitCostEvent(texts);

    return vectors;
  }

  /**
   * Wave 37.C (PRD-071 — llm-costs) — manual cost emission shim.
   *
   * Best-effort: any error in token estimation or logging is swallowed.
   * `usdCost: 0` because Ollama runs locally — no billable upstream call.
   * The event still emits so dashboards can graph token throughput per
   * tenant even for the zero-cost local provider.
   */
  private emitCostEvent(texts: ReadonlyArray<string>): void {
    try {
      const tokens = texts.reduce(
        (sum, text) => sum + Math.ceil(text.length / 4),
        0,
      );
      log.info('llm.cost', {
        event: 'llm.cost',
        tenantId: this.opts.tenantId,
        model: this.opts.model,
        tokens,
        usdCost: 0,
        timestamp: new Date().toISOString(),
        estimated: true,
      });
    } catch (err) {
      log.warn('llm.cost emission failed', {
        model: this.opts.model,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async embedOne(prompt: string): Promise<number[]> {
    const url = `${this.opts.url.replace(/\/+$/u, '')}/api/embeddings`;
    const timeoutMs = this.opts.timeoutMs ?? 30_000;

    let res: RestResponse<unknown>;
    try {
      res = await getManager(this._hostname, this.opts.manager).request({
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
