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
 * Hexagonal contract: implements {@link IEmbedder} and lives in
 * `infrastructure/`. The composition root constructs it; nothing else
 * references it directly.
 */
import { httpCaller } from '@gertsai/fetch';

import type { IEmbedder } from '../domain/ports/IEmbedder';

export interface OpenAIEmbedderOptions {
  readonly apiKey: string;
  readonly model: string;
  /** Override for OpenAI-compatible gateways (Azure, OpenRouter, etc.). */
  readonly baseUrl?: string;
  /** Per-request timeout in ms. Default 30s. */
  readonly timeoutMs?: number;
}

interface OpenAIEmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

/** `text-embedding-3-small` (the documented default) emits 1536-dim vectors. */
const DEFAULT_DIMENSIONS = 1536;

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

    let res;
    try {
      res = await httpCaller(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: [...texts], model: this.opts.model }),
        timeout: this.opts.timeoutMs ?? 30_000,
      });
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAIEmbedder: request to ${url} failed: ${cause}`);
    }

    if (!res.ok) {
      const body = await safeText(res);
      // Surface common failure modes with actionable hints.
      if (res.status === 401) {
        throw new Error(
          `OpenAIEmbedder: 401 Unauthorized — check EMBEDDER_API_KEY. Body: ${body.slice(0, 500)}`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `OpenAIEmbedder: 429 Rate Limited — slow down or upgrade plan. Body: ${body.slice(0, 500)}`,
        );
      }
      throw new Error(
        `OpenAIEmbedder: ${res.status} ${res.statusText} from ${url}. Body: ${body.slice(0, 500)}`,
      );
    }

    const json = (await res.json()) as OpenAIEmbeddingsResponse;
    if (!json || !Array.isArray(json.data)) {
      throw new Error(
        `OpenAIEmbedder: unexpected response shape from ${url} — expected { data: [...] }`,
      );
    }
    if (json.data.length !== texts.length) {
      throw new Error(
        `OpenAIEmbedder: response count mismatch (got ${json.data.length}, expected ${texts.length})`,
      );
    }

    // OpenAI returns vectors with an `index` field — sort to be safe even
    // though the docs guarantee input-order today.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((d) => d.embedding);

    if (!this.dimensionsLatched && vectors[0]?.length) {
      this._dimensions = vectors[0].length;
      this.dimensionsLatched = true;
    }
    return vectors;
  }
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<unable to read body>';
  }
}
