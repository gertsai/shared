/**
 * @gerts/ws-rpc
 *
 * WebSocket JSON-RPC 2.0 client with auto-reconnect and subscriptions.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { WsRpcClient } from '@gerts/ws-rpc';
 *
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
 *
 * ## Features
 *
 * - JSON-RPC 2.0 protocol
 * - Auto-reconnect with exponential backoff
 * - Topic-based subscriptions with wildcards
 * - Request timeout handling
 * - Message queuing when disconnected
 * - Heartbeat/ping support
 * - Works in browser and Node.js
 *
 * @packageDocumentation
 */

// ============================================================================
// Client
// ============================================================================

export { WsRpcClient } from './client.js';

// ============================================================================
// Utilities
// ============================================================================

export { ReconnectStrategy } from './reconnect.js';
export { SubscriptionManager } from './subscription.js';

// ============================================================================
// Types
// ============================================================================

export type {
  // JSON-RPC types
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcError,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,

  // Client options
  WsRpcOptions,
  ReconnectOptions,

  // Subscription types
  Subscription,
  SubscriptionCallback,

  // Events
  WsRpcEvents,

  // Internal (for testing)
  PendingRequest,
} from './types.js';

// ============================================================================
// Type Guards
// ============================================================================

export {
  isValidJsonRpcId,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
} from './types.js';

// ============================================================================
// Errors
// ============================================================================

export {
  RpcError,
  ConnectionError,
  RpcTimeoutError,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

export {
  JSON_RPC_VERSION,
  JsonRpcErrorCode,
} from './types.js';
