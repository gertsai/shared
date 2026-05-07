/**
 * OllamaEmbedder — outbound adapter for an Ollama-hosted embedding model.
 *
 * Thin wrapper around `POST {url}/api/embeddings` (Ollama's per-prompt
 * endpoint). Designed for local development against an Ollama daemon
 * running on `http://localhost:11434`.
 *
 * Implementation notes:
 *   - Ollama's embeddings endpoint accepts ONE prompt per request, so we
 *     issue requests serially. For a small example workload (a handful of
 *     chunks) this is fine; production callers should batch upstream or
 *     introduce parallelism with a concurrency limit.
 *   - HTTP transport goes through `@gertsai/fetch` (httpCaller) — the same
 *     vetted client every other adapter in this monorepo uses. localhost
 *     access requires explicitly opting in to SSRF-allow private networks.
 *   - `dimensions` is filled from the first successful response. Until the
 *     first call returns we report a sensible default for `nomic-embed-text`
 *     (768) so callers that probe `embedder.dimensions` at startup don't
 *     get NaN.
 *
 * Hexagonal contract: implements {@link IEmbedder} and lives in
 * `infrastructure/` — application/domain layers never import this module
 * directly. The composition root in `src/composition/infrastructure.ts`
 * is the only place that constructs it.
 */
import { httpCaller } from '@gertsai/fetch';

import type { IEmbedder } from '../domain/ports/IEmbedder';

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
  embedding: number[];
}

/** Conservative fallback for `nomic-embed-text` until the first call lands. */
const DEFAULT_DIMENSIONS = 768;

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

    let res;
    try {
      res = await httpCaller(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.opts.model, prompt }),
        timeout: this.opts.timeoutMs ?? 30_000,
        // Ollama is local — explicitly opt in. Without these, @gertsai/fetch
        // refuses localhost / private-network targets as an SSRF guard.
        security: {
          ssrfProtection: true,
          allowLocalhost: true,
          allowPrivateNetworks: true,
        },
      });
    } catch (err) {
      // Connection refused / DNS errors land here — give callers something
      // they can actually diagnose without grepping undici stack traces.
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(
        `OllamaEmbedder: request to ${url} failed — is the Ollama daemon ` +
          `running and reachable? (model='${this.opts.model}'). Underlying error: ${cause}`,
        { cause: err },
      );
    }

    if (!res.ok) {
      const bodyText = await safeText(res);
      throw new Error(
        `OllamaEmbedder: ${res.status} ${res.statusText} from ${url}. ` +
          `Body: ${bodyText.slice(0, 500)}`,
      );
    }

    const json = (await res.json()) as OllamaEmbeddingsResponse;
    if (!json || !Array.isArray(json.embedding) || json.embedding.length === 0) {
      throw new Error(
        `OllamaEmbedder: unexpected response shape from ${url} — ` +
          `expected { embedding: number[] }`,
      );
    }

    if (!this.dimensionsLatched) {
      this._dimensions = json.embedding.length;
      this.dimensionsLatched = true;
    } else if (
      json.embedding.length !== this._dimensions &&
      !this.warnedMismatch
    ) {
      this.warnedMismatch = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[OllamaEmbedder] dimension drift: first response was ${this._dimensions} ` +
          `dims, this one is ${json.embedding.length}. Mixing models?`,
      );
    }

    return json.embedding;
  }
}

/** Drain a response body to text, swallowing any read errors. */
async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unable to read body>';
  }
}
