/**
 * WebSocket JSON-RPC 2.0 Client
 * Based on patterns from Orchestra WebSocketManager
 */

import EventEmitter from 'eventemitter3';

import type {
  WsRpcOptions,
  WsRpcEvents,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  PendingRequest,
  JsonRpcId,
  SubscriptionCallback,
} from './types.js';
import {
  JSON_RPC_VERSION,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
  isJsonRpcNotification,
  RpcError,
  ConnectionError,
  RpcTimeoutError,
} from './types.js';
import { ReconnectStrategy } from './reconnect.js';
import { SubscriptionManager } from './subscription.js';

// ============================================================================
// WebSocket States (mirroring DOM WebSocket)
// ============================================================================

enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS = {
  timeout: 30000,
  heartbeatInterval: 30000,
  maxQueueSize: 100,
  maxMessageSize: 1024 * 1024, // 1MB
  maxPendingRequests: 1000,
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    delay: 1000,
    maxDelay: 30000,
    factor: 2,
    jitter: true,
  },
} as const;

// ============================================================================
// WsRpcClient
// ============================================================================

/**
 * WebSocket JSON-RPC 2.0 Client
 *
 * @example
 * ```typescript
 * const client = new WsRpcClient({
 *   url: 'ws://localhost:3023/ws',
 *   reconnect: { maxAttempts: 5 },
 * });
 *
 * await client.connect();
 *
 * // RPC call
 * const result = await client.call<QueryResult>('graph.query', {
 *   question: 'What is NeuraTech?',
 *   tenantId: 'demo',
 * });
 *
 * // Subscribe to events
 * const unsubscribe = client.subscribe('ingest.progress', (event) => {
 *   console.log(event.progress);
 * });
 *
 * // Cleanup
 * unsubscribe();
 * client.disconnect();
 * ```
 */
export class WsRpcClient extends EventEmitter<WsRpcEvents> {
  private ws: WebSocket | undefined;
  private readonly url: string;
  private readonly protocols: string | string[] | undefined;
  private readonly timeout: number;
  private readonly heartbeatInterval: number;
  private readonly maxQueueSize: number;
  private readonly maxMessageSize: number;
  private readonly maxPendingRequests: number;
  private readonly headers: Record<string, string> | undefined;

  private readonly reconnectStrategy: ReconnectStrategy;
  private readonly subscriptions: SubscriptionManager;
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();

  private state: WebSocketState = WebSocketState.CLOSED;
  private messageQueue: string[] = [];
  private idCounter = 0;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  /**
   * Synthetic-close timer scheduled by the `connect()` catch path
   * (FR-W1) for pre-onopen failures. Tracked separately from
   * {@link reconnectTimer} so {@link stopReconnection} can cancel it on
   * user-initiated `disconnect()` and avoid an unwanted reconnect storm.
   */
  private pendingSyntheticCloseTimer: NodeJS.Timeout | undefined;
  /**
   * Pong-watchdog timer (FR-W3). When the Node protocol-level ping path
   * is active, we expect a `pong` within `heartbeatInterval` of sending
   * the ping; otherwise we treat the connection as half-open and force
   * a close so the existing reconnect logic re-arms.
   */
  private pongWatchdogTimer: NodeJS.Timeout | undefined;
  /**
   * True iff the Node protocol-level ping/pong path is wired (FR-W3).
   * Set after we successfully attach a `pong` handler to the `ws` lib.
   */
  private wsProtocolHeartbeat = false;
  private isDestroyed = false;

  /**
   * Runtime target for {@link createWebSocket}. Defaults to `'node'` when the
   * caller omits `environment`, preserving the original Node-shaped surface.
   */
  private readonly environment: 'node' | 'browser';

  /**
   * In-flight connect promise shared by every concurrent {@link connect}
   * caller. Cleared once the underlying socket settles so that a subsequent
   * connect (after disconnect / reconnect) starts fresh.
   */
  private connecting: Promise<void> | null = null;

  constructor(options: WsRpcOptions) {
    super();

    this.url = options.url;
    this.protocols = options.protocols;
    this.timeout = options.timeout ?? DEFAULT_OPTIONS.timeout;
    this.heartbeatInterval = options.heartbeatInterval ?? DEFAULT_OPTIONS.heartbeatInterval;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_OPTIONS.maxQueueSize;
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_OPTIONS.maxMessageSize;
    this.maxPendingRequests = options.maxPendingRequests ?? DEFAULT_OPTIONS.maxPendingRequests;
    // Default to 'node' so legacy callers `{ url, headers }` keep working.
    this.environment = options.environment ?? 'node';
    // `headers` only exists on the Node branch of the union; drop it for
    // browser so we never silently forward something the runtime cannot use.
    this.headers =
      options.environment === 'browser' ? undefined : options.headers;

    this.reconnectStrategy = new ReconnectStrategy({
      ...DEFAULT_OPTIONS.reconnect,
      ...options.reconnect,
    });

    this.subscriptions = new SubscriptionManager();
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to WebSocket server.
   *
   * Concurrent callers share a single in-flight {@link connecting} promise so
   * there is exactly one open/error listener pair per attempt. This avoids
   * the race where a post-open transient `error` event would reject extra
   * listeners registered by a second caller even though the connection had
   * already succeeded for the first.
   */
  async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new ConnectionError('Client has been destroyed');
    }

    if (this.state === WebSocketState.OPEN) {
      return; // Already connected
    }

    // Concurrent calls (state === CONNECTING) ride the same promise.
    if (this.connecting) {
      return this.connecting;
    }

    this.state = WebSocketState.CONNECTING;

    this.connecting = new Promise<void>((resolve, reject) => {
      this.createWebSocket()
        .then((ws) => {
          this.ws = ws;
          this.setupWebSocketHandlers(ws, resolve, reject);
        })
        .catch((error) => {
          this.state = WebSocketState.CLOSED;
          const err = error instanceof Error ? error : new Error(String(error));
          // FR-W1 (H-WS-1, EVID-076): if `createWebSocket()` rejects
          // BEFORE `onopen` ever fires (DNS error, ECONNREFUSED, ws-lib
          // import failure, …) no `onclose` event is ever produced, so
          // the reconnect chain dies silently. Synthesise `handleClose`
          // here so the standard reconnect-on-close path re-arms the
          // timer. We schedule via `setTimeout(0)` to release the
          // microtask queue and avoid recursing into `connect()` while
          // `connecting` is still held by the current promise. The
          // timer handle is tracked so a user-initiated `disconnect()`
          // before it fires can cancel the unwanted reconnect.
          if (!this.isDestroyed && this.pendingSyntheticCloseTimer === undefined) {
            this.pendingSyntheticCloseTimer = setTimeout(() => {
              this.pendingSyntheticCloseTimer = undefined;
              if (!this.isDestroyed) {
                this.handleClose(1006, 'connect-failed');
              }
            }, 0);
          }
          reject(err);
        });
    });

    try {
      await this.connecting;
    } finally {
      // Always clear so a later reconnect can start fresh, regardless of
      // success/failure outcome of this attempt.
      this.connecting = null;
    }
  }

  /**
   * Create WebSocket instance (handles browser vs Node.js).
   *
   * Routing is driven by the {@link environment} field so callers in a
   * Node-shaped context (e.g. SSR) can opt into the browser code path
   * explicitly. We keep the `typeof window` fallback for the default
   * `'node'` setting in case the bundle is shipped to a browser without
   * the caller updating the option.
   */
  private async createWebSocket(): Promise<WebSocket> {
    const useBrowser =
      this.environment === 'browser' ||
      (typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined');

    if (useBrowser) {
      // Browser `WebSocket` does not accept headers — by construction
      // `this.headers` is undefined here (constructor drops it for the
      // browser branch), but we never forward it either way.
      const BrowserWS =
        typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined'
          ? window.WebSocket
          : (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (!BrowserWS) {
        throw new ConnectionError(
          "environment: 'browser' set but no global WebSocket is available",
        );
      }
      return new BrowserWS(this.url, this.protocols);
    }

    // Node.js environment - dynamic import of 'ws'
    const ws = await import('ws');
    const WSClass = ws.default ?? ws;

    type WSLikeCtor = new (
      url: string,
      protocols?: string | string[],
      options?: { headers?: Record<string, string> }
    ) => WebSocket;

    return new (WSClass as unknown as WSLikeCtor)(this.url, this.protocols, {
      ...(this.headers !== undefined && { headers: this.headers }),
    });
  }

  /**
   * Setup WebSocket event handlers.
   *
   * The `connectSettled` flag guards against post-open transient errors
   * leaking into a previously-resolved connect promise. After `onopen`
   * fires, `onerror` only emits the `error` event — it no longer rejects
   * the connect promise of any caller waiting on this attempt.
   */
  private setupWebSocketHandlers(
    ws: WebSocket,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    let connectSettled = false;

    ws.onopen = () => {
      this.state = WebSocketState.OPEN;
      this.reconnectStrategy.reset();
      this.startHeartbeat();
      this.flushQueue();
      this.emit('open');
      connectSettled = true;
      resolve();
    };

    ws.onclose = (event) => {
      this.handleClose(event.code, event.reason);
    };

    ws.onerror = () => {
      const error = new ConnectionError('WebSocket error');
      this.emit('error', error);
      if (!connectSettled && this.state === WebSocketState.CONNECTING) {
        connectSettled = true;
        reject(error);
      }
    };

    ws.onmessage = (event) => {
      // Validate that data is a string (WebSocket text frame)
      const data = event.data;
      if (typeof data !== 'string') {
        this.emit('error', new Error('Received non-string WebSocket message'));
        return;
      }

      // Validate message size to prevent DoS
      if (data.length > this.maxMessageSize) {
        this.emit('error', new Error(`Message size ${data.length} exceeds limit ${this.maxMessageSize}`));
        return;
      }

      this.handleMessage(data);
    };
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(code = 1000, reason = ''): void {
    this.stopReconnection();

    if (this.ws && this.state !== WebSocketState.CLOSED) {
      this.state = WebSocketState.CLOSING;
      this.ws.close(code, reason);
    }

    // Reject pending requests on disconnect to prevent memory leaks
    this.rejectAllPending(new ConnectionError('Disconnected'));
    this.cleanup();
  }

  /**
   * Destroy client and release resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.rejectAllPending(new ConnectionError('Client destroyed'));
    this.subscriptions.clear();
    this.removeAllListeners();
  }

  // ============================================================================
  // RPC Methods
  // ============================================================================

  /**
   * Make RPC call
   * @param method Method name
   * @param params Optional parameters
   * @returns Promise with result
   */
  async call<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams
  ): Promise<TResult> {
    const id = this.generateId();

    const request: JsonRpcRequest<TParams> = {
      jsonrpc: JSON_RPC_VERSION,
      id,
      method,
      ...(params !== undefined && { params }),
    };

    return new Promise<TResult>((resolve, reject) => {
      // Check pending requests limit to prevent memory exhaustion
      if (this.pendingRequests.size >= this.maxPendingRequests) {
        reject(new RpcError(
          `Too many pending requests (max: ${this.maxPendingRequests})`,
          -32603,
          undefined
        ));
        return;
      }

      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new RpcTimeoutError(method, this.timeout));
      }, this.timeout);

      // Store pending request
      const pending: PendingRequest<TResult> = {
        id,
        method,
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      };
      this.pendingRequests.set(id, pending as PendingRequest<unknown>);

      // Send request
      this.send(JSON.stringify(request));
    });
  }

  /**
   * Send notification (no response expected)
   * @param method Method name
   * @param params Optional parameters
   */
  notify<TParams = unknown>(method: string, params?: TParams): void {
    const notification: JsonRpcNotification<TParams> = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      ...(params !== undefined && { params }),
    };

    this.send(JSON.stringify(notification));
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Subscribe to server events
   * @param topic Event topic (supports wildcards)
   * @param callback Callback function
   * @returns Unsubscribe function
   */
  subscribe<T = unknown>(
    topic: string,
    callback: SubscriptionCallback<T>
  ): () => void {
    const id = this.subscriptions.subscribe(topic, callback);
    return () => this.subscriptions.unsubscribe(id);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    this.emit('message', data);

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON - ignore
      return;
    }

    // Handle response
    if (isJsonRpcResponse(parsed)) {
      this.handleResponse(parsed);
      return;
    }

    // Handle notification
    if (isJsonRpcNotification(parsed)) {
      this.handleNotification(parsed);
      return;
    }
  }

  /**
   * Handle RPC response
   */
  private handleResponse(response: JsonRpcResponse): void {
    // Per JSON-RPC spec, id can be null for parse errors
    // In that case, we can't match to a pending request
    if (response.id === null) {
      // Emit error event for server-side parse errors
      if ('error' in response) {
        this.emit('error', RpcError.fromJsonRpcError(response.error));
      }
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return; // Unknown request ID
    }

    // Clear timeout
    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    // Remove from pending
    this.pendingRequests.delete(response.id);

    // Resolve or reject
    if (isJsonRpcSuccessResponse(response)) {
      pending.resolve(response.result);
    } else {
      pending.reject(RpcError.fromJsonRpcError(response.error));
    }
  }

  /**
   * Handle server notification
   */
  private handleNotification(notification: JsonRpcNotification): void {
    // Emit generic notification event
    this.emit('notification', notification.method, notification.params);

    // Dispatch to subscriptions
    this.subscriptions.dispatch(notification.method, notification.params);
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  /**
   * Handle connection close
   */
  private handleClose(code: number, reason: string): void {
    this.state = WebSocketState.CLOSED;
    this.cleanup();
    this.emit('close', code, reason);

    // Check if should reconnect
    if (this.shouldReconnect(code)) {
      this.scheduleReconnection();
    }
  }

  /**
   * Check if should attempt reconnection
   */
  private shouldReconnect(code: number): boolean {
    // Don't reconnect on normal closure
    if (code === 1000) {
      return false;
    }

    return !this.isDestroyed && this.reconnectStrategy.shouldReconnect();
  }

  /**
   * Schedule reconnection attempt.
   *
   * Order matters: we read the delay BEFORE bumping `attempts` so the
   * first retry actually waits `initialDelay * factor^0 = initialDelay`,
   * not `initialDelay * factor^1`. See Wave 21 fix for FR-W5 (M-WS-1
   * off-by-one in audit EVID-076).
   *
   * If `createWebSocket()` rejects synchronously (DNS error,
   * ECONNREFUSED, ws-lib import failure), no `onclose` is emitted —
   * `handleClose` would never fire and the reconnect chain would die.
   * We rescue that path by calling `handleClose(1006, '...')` here, so
   * the existing reconnect-on-close logic re-arms the timer. See FR-W1
   * (H-WS-1) in EVID-076.
   */
  private scheduleReconnection(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    // Compute the delay BEFORE recording the attempt so the exponent is
    // `attempts` (0 on the very first retry) rather than `attempts + 1`.
    const delay = this.reconnectStrategy.getDelay();
    this.reconnectStrategy.recordAttempt();
    const attempt = this.reconnectStrategy.getAttempts();

    this.emit('reconnecting', attempt, delay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect()
        .then(() => {
          this.emit('reconnected');
        })
        .catch(() => {
          // The `connect()` catch path itself schedules a synthetic
          // `handleClose(1006)` for pre-onopen rejections (FR-W1), so
          // we do NOT re-arm here to avoid double-scheduling.
        });
    }, delay);
  }

  /**
   * Stop reconnection attempts. Also cancels any synthetic-close timer
   * queued by the {@link connect}-catch FR-W1 path so a user-initiated
   * `disconnect()` is not undone by a subsequent reconnect storm.
   */
  private stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.pendingSyntheticCloseTimer) {
      clearTimeout(this.pendingSyntheticCloseTimer);
      this.pendingSyntheticCloseTimer = undefined;
    }
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  /**
   * Start heartbeat.
   *
   * FR-W3 (EVID-076 H-WS-3): in Node we prefer the WebSocket
   * protocol-level ping/pong frames exposed by the `ws` library
   * (`ws.ping()` + `'pong'` event). Protocol-level pings let the OS TCP
   * stack — and any intermediate proxies — detect dead connections far
   * faster than waiting for a 2-hour OS keepalive on a half-open socket,
   * and they require no server-side handler. We additionally arm a
   * pong-watchdog that force-closes the socket when no pong arrives in
   * 2x the heartbeat interval, so the existing reconnect chain re-arms.
   *
   * The browser `WebSocket` API does NOT expose protocol-level ping, so
   * the legacy app-level `notify('ping')` path remains for that
   * environment.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval <= 0) {
      return;
    }

    this.stopHeartbeat();

    // Detect the Node `ws` library: it exposes `ping(...)` and an
    // `on('pong', ...)` EventEmitter API which the browser WebSocket
    // does not. `typeof window === 'undefined'` is a fast structural
    // probe, but we also feature-detect to be safe in mixed runtimes
    // (e.g. JSDOM-on-Node where `window` exists but `ws` is in use).
    const ws = this.ws as
      | (WebSocket & {
          ping?: (data?: unknown, mask?: boolean, cb?: (err?: Error) => void) => void;
          on?: (event: string, cb: (...args: unknown[]) => void) => unknown;
        })
      | undefined;
    const isNodeWs =
      this.environment === 'node' &&
      typeof ws?.ping === 'function' &&
      typeof ws?.on === 'function';

    if (isNodeWs && ws) {
      // Wire pong handler once per socket. Each pong cancels the
      // watchdog — if no pong arrives before the next interval, the
      // watchdog fires `disconnect(1001)` to trigger reconnect.
      this.wsProtocolHeartbeat = true;
      ws.on?.('pong', () => {
        if (this.pongWatchdogTimer) {
          clearTimeout(this.pongWatchdogTimer);
          this.pongWatchdogTimer = undefined;
        }
      });

      this.heartbeatTimer = setInterval(() => {
        if (this.state !== WebSocketState.OPEN) {
          return;
        }
        try {
          ws.ping?.();
        } catch {
          // ws.ping can throw if the socket is already closing — let
          // the close handler drive the reconnect path.
          return;
        }
        // Arm watchdog: if no pong within 2x interval, declare dead.
        if (this.pongWatchdogTimer) {
          clearTimeout(this.pongWatchdogTimer);
        }
        this.pongWatchdogTimer = setTimeout(() => {
          this.pongWatchdogTimer = undefined;
          if (this.state === WebSocketState.OPEN && this.ws) {
            try {
              this.ws.close(1001, 'pong-timeout');
            } catch {
              // Defensive — `close()` should not throw, but if the lib
              // misbehaves we synthesise the close ourselves so the
              // reconnect chain still re-arms.
              this.handleClose(1001, 'pong-timeout');
            }
          }
        }, this.heartbeatInterval * 2);
      }, this.heartbeatInterval);
      return;
    }

    // Browser / fallback path — app-level JSON-RPC ping notification.
    this.wsProtocolHeartbeat = false;
    this.heartbeatTimer = setInterval(() => {
      if (this.state === WebSocketState.OPEN) {
        // Send ping notification
        this.notify('ping');
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat (and cancel any in-flight pong watchdog).
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.pongWatchdogTimer) {
      clearTimeout(this.pongWatchdogTimer);
      this.pongWatchdogTimer = undefined;
    }
    this.wsProtocolHeartbeat = false;
  }

  // ============================================================================
  // Message Queue
  // ============================================================================

  /**
   * Send message (queue if not connected)
   */
  private send(data: string): void {
    if (this.state === WebSocketState.OPEN && this.ws?.readyState === WebSocketState.OPEN) {
      try {
        this.ws.send(data);
      } catch {
        this.queueMessage(data);
      }
    } else {
      this.queueMessage(data);
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(data: string): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest
    }
    this.messageQueue.push(data);
  }

  /**
   * Flush queued messages
   */
  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.state === WebSocketState.OPEN) {
      const data = this.messageQueue.shift();
      if (data && this.ws) {
        try {
          this.ws.send(data);
        } catch {
          this.messageQueue.unshift(data);
          break;
        }
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHeartbeat();
    this.ws = undefined;
  }

  /**
   * Reject all pending requests
   */
  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Generate unique request ID
   */
  private generateId(): JsonRpcId {
    return ++this.idCounter;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === WebSocketState.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    switch (this.state) {
      case WebSocketState.CONNECTING:
        return 'connecting';
      case WebSocketState.OPEN:
        return 'open';
      case WebSocketState.CLOSING:
        return 'closing';
      case WebSocketState.CLOSED:
      default:
        return 'closed';
    }
  }

  /**
   * Get number of pending requests
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
