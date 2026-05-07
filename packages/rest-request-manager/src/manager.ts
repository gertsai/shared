// SPDX-License-Identifier: Apache-2.0
import { retry, withTimeout } from '@gertsai/async-utils';
import type { RetryOpts } from '@gertsai/async-utils';
import { RateLimitedError } from '@gertsai/errors';
import { httpCaller } from '@gertsai/fetch';
import type { ResponseLike } from '@gertsai/fetch';
import type { Logger } from '@gertsai/logger-factory';
import { CircuitBreaker } from './circuit-breaker.js';
import { TokenBucketRateLimiter } from './rate-limiter.js';
import { redact } from './redaction.js';
import { translateHttpStatus, translateTransportError } from './translation.js';
import type {
  RestCallOpts,
  RestRequest,
  RestRequestManagerOpts,
  RestRequestManagerStats,
  RestResponse,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * HTTP request manager composing retry + token-bucket rate limit + LRU
 * per-host circuit breaker over `@gertsai/fetch.httpCaller`.
 *
 * Per ADR-009 Decision D + invariants I-8 (typed errors), I-9
 * (REDACTION_KEYS for logs), Amendment 1.2.1 (LRU `maxHosts`),
 * Amendment 1.2.8 (AbortError → TimeoutError), Amendment 1.2.10/.11
 * (Node-only + TLS hardening).
 */
export class RestRequestManager {
  private readonly opts: RestRequestManagerOpts;
  private readonly retryOpts: RetryOpts;
  private readonly rateLimiter: TokenBucketRateLimiter | undefined;
  private readonly breaker: CircuitBreaker;
  private readonly logger: Logger | undefined;
  private totalRequests = 0;
  private totalRetries = 0;
  private rateLimitedRequests = 0;

  constructor(opts: RestRequestManagerOpts = {}) {
    this.opts = opts;
    const userOnRetry = opts.retry?.onRetry;
    this.retryOpts = {
      ...opts.retry,
      onRetry: (attempt, error, delayMs) => {
        this.totalRetries += 1;
        userOnRetry?.(attempt, error, delayMs);
      },
    };
    this.rateLimiter = opts.rateLimit ? new TokenBucketRateLimiter(opts.rateLimit) : undefined;
    this.breaker = new CircuitBreaker(opts.circuitBreaker);
    this.logger = opts.logger;
  }

  async request<TBody = unknown, TResponse = unknown>(
    request: RestRequest<TBody>,
  ): Promise<RestResponse<TResponse>> {
    this.totalRequests += 1;

    const url = this.resolveUrl(request.url);
    const host = this.extractHost(url);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (this.rateLimiter !== undefined) {
      try {
        this.rateLimiter.acquire();
      } catch (e) {
        if (e instanceof RateLimitedError) {
          this.rateLimitedRequests += 1;
        }
        throw e;
      }
    }

    this.breaker.preflight(host);

    this.logger?.debug('rest-request-manager: dispatch', {
      method: request.method,
      url,
      headers: redact(request.headers, this.opts.redactRequestKeys),
      body: redact(request.body, this.opts.redactRequestKeys),
    });

    let response: ResponseLike;
    try {
      response = await retry(
        () => withTimeout(() => this.invoke(url, request), timeoutMs),
        this.retryOpts,
      );
    } catch (e) {
      const translated = translateTransportError(e, timeoutMs);
      this.breaker.recordFailure(host);
      // Sprint 3.10 W-3-10-14: surface the full `Error.cause` chain so
      // operators can correlate the translated AppError with the original
      // transport-layer cause (e.g. `TimeoutError → AbortError →
      // FetchError`). Without this, only the topmost message reaches the
      // logger and root-cause analysis requires reproducing the failure.
      this.logger?.error('rest-request-manager: transport failure', {
        method: request.method,
        url,
        error: translated instanceof Error ? translated.message : String(translated),
        causeChain: walkCauseChain(translated),
      });
      throw translated;
    }

    if (!response.ok) {
      this.breaker.recordFailure(host);
      const body = await this.parseBody(response);
      this.logger?.warn('rest-request-manager: non-ok response', {
        method: request.method,
        url,
        status: response.status,
        body: redact(body, this.opts.redactResponseKeys),
      });
      throw translateHttpStatus(response.status, body, url);
    }

    this.breaker.recordSuccess(host);
    const parsedBody = (await this.parseBody(response)) as TResponse;
    const headers = this.serializeHeaders(response.headers);

    this.logger?.debug('rest-request-manager: success', {
      method: request.method,
      url,
      status: response.status,
      body: redact(parsedBody, this.opts.redactResponseKeys),
    });

    return {
      status: response.status,
      headers,
      body: parsedBody,
    };
  }

  get<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>> {
    return this.request<undefined, TResponse>({
      url,
      method: 'GET',
      headers: opts?.headers,
      timeoutMs: opts?.timeoutMs,
    });
  }

  post<TBody, TResponse>(
    url: string,
    body: TBody,
    opts?: RestCallOpts,
  ): Promise<RestResponse<TResponse>> {
    return this.request<TBody, TResponse>({
      url,
      method: 'POST',
      body,
      headers: opts?.headers,
      timeoutMs: opts?.timeoutMs,
    });
  }

  put<TBody, TResponse>(
    url: string,
    body: TBody,
    opts?: RestCallOpts,
  ): Promise<RestResponse<TResponse>> {
    return this.request<TBody, TResponse>({
      url,
      method: 'PUT',
      body,
      headers: opts?.headers,
      timeoutMs: opts?.timeoutMs,
    });
  }

  delete<TResponse>(url: string, opts?: RestCallOpts): Promise<RestResponse<TResponse>> {
    return this.request<undefined, TResponse>({
      url,
      method: 'DELETE',
      headers: opts?.headers,
      timeoutMs: opts?.timeoutMs,
    });
  }

  patch<TBody, TResponse>(
    url: string,
    body: TBody,
    opts?: RestCallOpts,
  ): Promise<RestResponse<TResponse>> {
    return this.request<TBody, TResponse>({
      url,
      method: 'PATCH',
      body,
      headers: opts?.headers,
      timeoutMs: opts?.timeoutMs,
    });
  }

  getStats(): RestRequestManagerStats {
    return {
      totalRequests: this.totalRequests,
      totalRetries: this.totalRetries,
      circuitOpens: this.breaker.getOpensCount(),
      rateLimitedRequests: this.rateLimitedRequests,
      circuitEvictions: this.breaker.getEvictionsCount(),
    };
  }

  resetStats(): void {
    this.totalRequests = 0;
    this.totalRetries = 0;
    this.rateLimitedRequests = 0;
    this.breaker.reset();
  }

  private async invoke<TBody>(url: string, request: RestRequest<TBody>): Promise<ResponseLike> {
    const headers: Record<string, string> = { ...request.headers };
    let bodyInit: string | undefined;
    if (request.body !== undefined && request.method !== 'GET' && request.method !== 'DELETE') {
      if (typeof request.body === 'string') {
        bodyInit = request.body;
      } else {
        bodyInit = JSON.stringify(request.body);
        if (headers['content-type'] === undefined && headers['Content-Type'] === undefined) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }
    return httpCaller(url, {
      method: request.method,
      headers,
      body: bodyInit,
    });
  }

  private async parseBody(response: ResponseLike): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return undefined;
      }
    }
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }

  private serializeHeaders(headers: ResponseLike['headers']): Readonly<Record<string, string>> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  private resolveUrl(url: string): string {
    if (this.opts.baseUrl === undefined) return url;
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.opts.baseUrl.endsWith('/')
      ? this.opts.baseUrl.slice(0, -1)
      : this.opts.baseUrl;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
}

/**
 * Walk an `Error.cause` chain and return a flat array of messages
 * (closest cause first). Bounded at 5 levels and uses a `WeakSet`
 * anti-cycle guard mirroring the Sprint 3.6 I-13 cause-cycle pattern,
 * so a self-referential or mutual-causation chain cannot stall logging.
 * Sprint 3.10 W-3-10-14.
 */
function walkCauseChain(err: unknown): readonly string[] {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  let current: unknown = err instanceof Error ? err.cause : undefined;
  let depth = 0;
  while (current !== undefined && current !== null && depth < 5) {
    if (typeof current === 'object') {
      if (seen.has(current as object)) {
        out.push('[cause-cycle]');
        break;
      }
      seen.add(current as object);
    }
    out.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
    depth += 1;
  }
  return out;
}
