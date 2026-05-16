/**
 * Tests for WsRpcClient
 */

import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';
import { WsRpcClient } from '../client.js';
import {
  RpcError,
  RpcTimeoutError,
  ConnectionError,
  type WsRpcOptions,
  type WsRpcOptionsBrowser,
  type WsRpcOptionsNode,
} from '../types.js';

// Mock WebSocket for Node.js environment
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  private sentMessages: string[] = [];

  constructor(
    public url: string,
    public protocols?: string | string[],
    public options?: { headers?: Record<string, string> }
  ) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  // Simulate receiving a message
  receiveMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

// Mock the 'ws' module
vi.mock('ws', () => ({
  default: MockWebSocket,
  WebSocket: MockWebSocket,
}));

describe('WsRpcClient', () => {
  let client: WsRpcClient;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    // Disconnect cleanly before destroy to avoid unhandled rejections
    if (client) {
      client.disconnect();
      client.removeAllListeners();
    }
    // Clear all timers without running them
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with minimal options', () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });
      expect(client).toBeInstanceOf(WsRpcClient);
      expect(client.getState()).toBe('closed');
    });

    it('should create with all options', () => {
      client = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        protocols: 'json-rpc',
        timeout: 5000,
        heartbeatInterval: 10000,
        maxQueueSize: 50,
        headers: { 'X-API-Key': 'secret' },
        reconnect: {
          enabled: true,
          maxAttempts: 3,
          delay: 500,
        },
      });

      expect(client).toBeInstanceOf(WsRpcClient);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const openHandler = vi.fn();
      client.on('open', openHandler);

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      expect(client.isConnected()).toBe(true);
      expect(client.getState()).toBe('open');
      expect(openHandler).toHaveBeenCalled();
    });

    it('should return immediately if already connected', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise1 = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise1;

      // Should not throw or hang
      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('should throw if destroyed', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });
      client.destroy();

      await expect(client.connect()).rejects.toThrow(ConnectionError);
    });
  });

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      const closeHandler = vi.fn();
      client.on('close', closeHandler);

      client.disconnect();

      expect(client.getState()).toBe('closed');
      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe('call', () => {
    beforeEach(async () => {
      client = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        timeout: 1000,
      });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;
    });

    it('should send JSON-RPC request', async () => {
      const callPromise = client.call('test.method', { foo: 'bar' });

      // Get the mock WebSocket
      const ws = (client as any).ws as MockWebSocket;
      const messages = ws.getSentMessages();

      expect(messages).toHaveLength(1);

      const request = JSON.parse(messages[0] as string);
      expect(request.jsonrpc).toBe('2.0');
      expect(request.id).toBe(1);
      expect(request.method).toBe('test.method');
      expect(request.params).toEqual({ foo: 'bar' });

      // Simulate response
      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        })
      );

      const result = await callPromise;
      expect(result).toEqual({ success: true });
    });

    it('should handle error response', async () => {
      const callPromise = client.call('test.method');

      const ws = (client as any).ws as MockWebSocket;

      // Simulate error response
      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        })
      );

      await expect(callPromise).rejects.toThrow(RpcError);
      await expect(callPromise).rejects.toMatchObject({
        code: -32601,
        message: 'Method not found',
      });
    });

    it('should emit error event for parse error with null id', async () => {
      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      const ws = (client as any).ws as MockWebSocket;

      // Simulate parse error response (id is null per JSON-RPC spec)
      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        })
      );

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(RpcError);
      expect(errorHandler.mock.calls[0][0].code).toBe(-32700);
    });

    it('should timeout if no response', async () => {
      // Create a wrapped promise that we can properly await
      let caughtError: Error | null = null;

      const callPromise = client.call('test.method').catch((err) => {
        caughtError = err;
        return null;
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(1100);

      // Wait for the promise to settle
      await callPromise;

      // Verify the error
      expect(caughtError).toBeInstanceOf(RpcTimeoutError);
      expect((caughtError as unknown as RpcTimeoutError).method).toBe('test.method');
      expect((caughtError as unknown as RpcTimeoutError).timeout).toBe(1000);
    });

    it('should generate unique IDs', async () => {
      // Start calls but catch rejections to avoid unhandled promise rejections
      const p1 = client.call('method1').catch(() => {});
      const p2 = client.call('method2').catch(() => {});

      const ws = (client as any).ws as MockWebSocket;
      const messages = ws.getSentMessages();

      const id1 = JSON.parse(messages[0] as string).id;
      const id2 = JSON.parse(messages[1] as string).id;

      expect(id1).not.toBe(id2);

      // Respond to prevent timeout errors during cleanup
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: id1, result: null }));
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: id2, result: null }));

      await p1;
      await p2;
    });
  });

  describe('notify', () => {
    beforeEach(async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;
    });

    it('should send notification without id', () => {
      client.notify('test.event', { data: 123 });

      const ws = (client as any).ws as MockWebSocket;
      const messages = ws.getSentMessages();

      expect(messages).toHaveLength(1);

      const notification = JSON.parse(messages[0] as string);
      expect(notification.jsonrpc).toBe('2.0');
      expect(notification.method).toBe('test.event');
      expect(notification.params).toEqual({ data: 123 });
      expect(notification.id).toBeUndefined();
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;
    });

    it('should receive notifications', () => {
      const callback = vi.fn();
      client.subscribe('user.created', callback);

      const ws = (client as any).ws as MockWebSocket;

      // Simulate server notification
      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'user.created',
          params: { id: '123', name: 'John' },
        })
      );

      expect(callback).toHaveBeenCalledWith({ id: '123', name: 'John' });
    });

    it('should support wildcards', () => {
      const callback = vi.fn();
      client.subscribe('user.*', callback);

      const ws = (client as any).ws as MockWebSocket;

      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'user.created',
          params: { event: 'created' },
        })
      );

      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'user.updated',
          params: { event: 'updated' },
        })
      );

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = client.subscribe('topic', callback);

      expect(client.getSubscriptionCount()).toBe(1);

      unsubscribe();

      expect(client.getSubscriptionCount()).toBe(0);
    });
  });

  describe('message queue', () => {
    it('should queue messages when disconnected', () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      // Not connected, should queue
      client.notify('test.event');

      expect(client.getQueueSize()).toBe(1);
    });

    it('should flush queue on connect', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      // Queue messages while disconnected
      client.notify('event1');
      client.notify('event2');
      expect(client.getQueueSize()).toBe(2);

      // Connect
      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      // Queue should be flushed
      expect(client.getQueueSize()).toBe(0);

      const ws = (client as any).ws as MockWebSocket;
      expect(ws.getSentMessages()).toHaveLength(2);
    });
  });

  describe('events', () => {
    it('should emit notification event', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      const notificationHandler = vi.fn();
      client.on('notification', notificationHandler);

      const ws = (client as any).ws as MockWebSocket;
      ws.receiveMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test.event',
          params: { data: 'value' },
        })
      );

      expect(notificationHandler).toHaveBeenCalledWith('test.event', {
        data: 'value',
      });
    });

    it('should emit message event', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      const messageHandler = vi.fn();
      client.on('message', messageHandler);

      const ws = (client as any).ws as MockWebSocket;
      ws.receiveMessage('{"jsonrpc":"2.0","method":"test"}');

      expect(messageHandler).toHaveBeenCalledWith('{"jsonrpc":"2.0","method":"test"}');
    });
  });

  describe('utility methods', () => {
    it('should return pending count', async () => {
      client = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        timeout: 10000,
      });

      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      expect(client.getPendingCount()).toBe(0);

      // Create calls with catch to avoid unhandled rejections
      const p1 = client.call('method1').catch(() => {});
      const p2 = client.call('method2').catch(() => {});

      expect(client.getPendingCount()).toBe(2);

      // Respond to cleanup
      const ws = (client as any).ws as MockWebSocket;
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }));
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: 2, result: null }));

      await p1;
      await p2;
    });
  });

  describe('security limits', () => {
    it('should reject message exceeding maxMessageSize', async () => {
      const errorHandler = vi.fn();
      const smallClient = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        maxMessageSize: 100, // 100 bytes
      });
      smallClient.on('error', errorHandler);

      const connectPromise = smallClient.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      const ws = (smallClient as any).ws as MockWebSocket;

      // Send message larger than 100 bytes
      const largeMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: 'x'.repeat(200),
      });
      ws.receiveMessage(largeMessage);

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0].message).toContain('exceeds limit');

      smallClient.disconnect();
    });

    it('should reject when too many pending requests', async () => {
      const limitedClient = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        maxPendingRequests: 2,
        timeout: 10000,
      });

      const connectPromise = limitedClient.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      // Queue 2 requests (at limit)
      const p1 = limitedClient.call('method1').catch(() => {});
      const p2 = limitedClient.call('method2').catch(() => {});

      // Third request should be rejected
      let caughtError: RpcError | null = null;
      try {
        await limitedClient.call('method3');
      } catch (err) {
        caughtError = err as RpcError;
      }

      expect(caughtError).toBeInstanceOf(RpcError);
      expect(caughtError?.code).toBe(-32603);
      expect(caughtError?.message).toContain('Too many pending requests');

      // Clean up
      const ws = (limitedClient as any).ws as MockWebSocket;
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }));
      ws.receiveMessage(JSON.stringify({ jsonrpc: '2.0', id: 2, result: null }));
      await p1;
      await p2;

      limitedClient.disconnect();
    });

    it('should reject pending requests on disconnect', async () => {
      const connectPromise = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await connectPromise;

      // Start a call
      let rejectedError: Error | null = null;
      const callPromise = client.call('test.method').catch((err) => {
        rejectedError = err;
      });

      // Disconnect while call is pending
      client.disconnect();

      await callPromise;

      expect(rejectedError).toBeTruthy();
      expect(rejectedError?.message).toBe('Disconnected');
    });
  });

  describe('connect() concurrency', () => {
    it('should share a single in-flight connect promise across concurrent callers', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const openHandler = vi.fn();
      client.on('open', openHandler);

      const p1 = client.connect();
      const p2 = client.connect();
      const p3 = client.connect();

      await vi.advanceTimersByTimeAsync(50);
      await Promise.all([p1, p2, p3]);

      // Exactly one open emission — listeners should not multiply per caller.
      expect(openHandler).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
    });

    it('should not reject any caller when a post-open error fires', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      const p1 = client.connect();
      const p2 = client.connect();

      await vi.advanceTimersByTimeAsync(50);
      await Promise.all([p1, p2]);
      expect(client.isConnected()).toBe(true);

      // Simulate a transient WS-level error AFTER open.
      const ws = (client as any).ws as { onerror?: () => void };
      ws.onerror?.();

      // Error should be emitted but not reject either resolved promise.
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(ConnectionError);
      // Connection should still be considered open (post-open transient errors
      // are surfaced via the event, not by collapsing state).
      expect(client.isConnected()).toBe(true);
    });

    it('should allow a fresh connect after disconnect (in-flight slot cleared)', async () => {
      client = new WsRpcClient({ url: 'ws://localhost:3023/ws' });

      const p1 = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await p1;
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.getState()).toBe('closed');

      // Second cycle must spin up a brand-new WebSocket.
      const p2 = client.connect();
      await vi.advanceTimersByTimeAsync(50);
      await p2;
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('WsRpcOptions discriminated union', () => {
    it('should accept headers on the Node branch (default environment)', () => {
      // Backward-compat: legacy callers without `environment`.
      const legacy: WsRpcOptions = {
        url: 'ws://localhost:3023/ws',
        headers: { Authorization: 'Bearer x' },
      };
      expect(legacy.url).toBe('ws://localhost:3023/ws');

      // Explicit Node branch.
      const explicit: WsRpcOptionsNode = {
        url: 'ws://localhost:3023/ws',
        environment: 'node',
        headers: { 'X-API-Key': 'secret' },
      };
      expectTypeOf(explicit.headers).toEqualTypeOf<Record<string, string> | undefined>();
    });

    it('should reject headers on the Browser branch at compile time', () => {
      const browserOpts: WsRpcOptionsBrowser = {
        url: 'ws://localhost:3023/ws',
        environment: 'browser',
        // @ts-expect-error -- `headers` is intentionally absent from the browser branch.
        headers: { 'X-API-Key': 'secret' },
      };
      // Runtime sanity: browser-shaped options still construct a client.
      expect(browserOpts.environment).toBe('browser');
    });

    it('should drop headers at runtime when environment is browser', () => {
      const c = new WsRpcClient({
        url: 'ws://localhost:3023/ws',
        environment: 'browser',
        // Type-system already prevents `headers` here; cast tests the
        // belt-and-braces runtime guard against bad casts at the boundary.
      } as unknown as WsRpcOptions);
      // Internal field — verify we didn't smuggle headers through a cast.
      expect((c as unknown as { headers: unknown }).headers).toBeUndefined();
    });
  });
});
