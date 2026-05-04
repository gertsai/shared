/**
 * JSON-RPC 2.0 Types for WebSocket RPC
 * Based on JSON-RPC 2.0 Specification: https://www.jsonrpc.org/specification
 */

// ============================================================================
// JSON-RPC 2.0 Core Types
// ============================================================================

/**
 * JSON-RPC version constant
 */
export const JSON_RPC_VERSION = '2.0' as const;

/**
 * JSON-RPC Request ID type
 */
export type JsonRpcId = string | number;

/**
 * JSON-RPC Request object
 */
export interface JsonRpcRequest<TParams = unknown> {
  /** JSON-RPC version (must be "2.0") */
  jsonrpc: typeof JSON_RPC_VERSION;
  /** Request identifier */
  id: JsonRpcId;
  /** Method name */
  method: string;
  /** Optional parameters */
  params?: TParams;
}

/**
 * JSON-RPC Notification (request without id)
 */
export interface JsonRpcNotification<TParams = unknown> {
  /** JSON-RPC version (must be "2.0") */
  jsonrpc: typeof JSON_RPC_VERSION;
  /** Method name */
  method: string;
  /** Optional parameters */
  params?: TParams;
}

/**
 * JSON-RPC Error object
 */
export interface JsonRpcError<TData = unknown> {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Optional additional data */
  data?: TData;
}

/**
 * JSON-RPC Success Response
 */
export interface JsonRpcSuccessResponse<TResult = unknown> {
  /** JSON-RPC version (must be "2.0") */
  jsonrpc: typeof JSON_RPC_VERSION;
  /** Request identifier */
  id: JsonRpcId;
  /** Result data */
  result: TResult;
}

/**
 * JSON-RPC Error Response
 */
export interface JsonRpcErrorResponse<TData = unknown> {
  /** JSON-RPC version (must be "2.0") */
  jsonrpc: typeof JSON_RPC_VERSION;
  /** Request identifier */
  id: JsonRpcId | null;
  /** Error object */
  error: JsonRpcError<TData>;
}

/**
 * JSON-RPC Response (success or error)
 */
export type JsonRpcResponse<TResult = unknown, TData = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse<TData>;

// ============================================================================
// Standard JSON-RPC Error Codes
// ============================================================================

/**
 * Standard JSON-RPC 2.0 error codes
 */
export enum JsonRpcErrorCode {
  /** Invalid JSON was received */
  PARSE_ERROR = -32700,
  /** Invalid Request object */
  INVALID_REQUEST = -32600,
  /** Method not found */
  METHOD_NOT_FOUND = -32601,
  /** Invalid method parameters */
  INVALID_PARAMS = -32602,
  /** Internal JSON-RPC error */
  INTERNAL_ERROR = -32603,
  /** Server error range start */
  SERVER_ERROR_START = -32099,
  /** Server error range end */
  SERVER_ERROR_END = -32000,
}

// ============================================================================
// WebSocket RPC Options
// ============================================================================

/**
 * Reconnection strategy options
 */
export interface ReconnectOptions {
  /** Enable auto-reconnect */
  enabled?: boolean;
  /** Maximum number of reconnection attempts */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  delay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff multiplier */
  factor?: number;
  /** Add randomness to delay */
  jitter?: boolean;
}

/**
 * WebSocket RPC client options
 */
export interface WsRpcOptions {
  /** WebSocket URL */
  url: string;
  /** WebSocket protocols */
  protocols?: string | string[];
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Reconnection options */
  reconnect?: ReconnectOptions;
  /** Heartbeat interval in milliseconds (0 to disable) */
  heartbeatInterval?: number;
  /** Max queued messages when disconnected */
  maxQueueSize?: number;
  /** Custom headers for connection (Node.js only) */
  headers?: Record<string, string>;
  /** Max message size in bytes (default: 1MB). Messages exceeding this are rejected. */
  maxMessageSize?: number;
  /** Max pending requests (default: 1000). Prevents memory exhaustion from too many concurrent requests. */
  maxPendingRequests?: number;
}

// ============================================================================
// Subscription Types
// ============================================================================

/**
 * Subscription callback function
 */
export type SubscriptionCallback<T = unknown> = (data: T) => void;

/**
 * Subscription entry
 */
export interface Subscription<T = unknown> {
  /** Unique subscription ID */
  id: string;
  /** Topic pattern */
  topic: string;
  /** Callback function */
  callback: SubscriptionCallback<T>;
  /** Whether pattern is a wildcard */
  isWildcard: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * WebSocket RPC client events
 */
export interface WsRpcEvents {
  /** Connection opened */
  open: [];
  /** Connection closed */
  close: [code: number, reason: string];
  /** Error occurred */
  error: [error: Error];
  /** Attempting to reconnect */
  reconnecting: [attempt: number, delay: number];
  /** Successfully reconnected */
  reconnected: [];
  /** Notification received */
  notification: [method: string, params: unknown];
  /** Raw message received (for debugging) */
  message: [data: string];
}

// ============================================================================
// Pending Request
// ============================================================================

/**
 * Pending request entry (internal)
 */
export interface PendingRequest<T = unknown> {
  /** Request ID */
  id: JsonRpcId;
  /** Method name */
  method: string;
  /** Resolve function */
  resolve: (result: T) => void;
  /** Reject function */
  reject: (error: Error) => void;
  /** Timeout timer */
  timer?: NodeJS.Timeout;
  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is a valid JSON-RPC ID (string or number, not null)
 */
export function isValidJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Check if value is a JSON-RPC request
 */
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === JSON_RPC_VERSION &&
    isValidJsonRpcId(obj.id) &&
    typeof obj.method === 'string'
  );
}

/**
 * Check if value is a JSON-RPC notification
 */
export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jsonrpc' in value &&
    (value as JsonRpcNotification).jsonrpc === JSON_RPC_VERSION &&
    !('id' in value) &&
    'method' in value &&
    typeof (value as JsonRpcNotification).method === 'string'
  );
}

/**
 * Check if value is a JSON-RPC response
 * Note: Per spec, error responses may have id: null if parse error occurred
 */
export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;

  // Must have jsonrpc version and id field
  if (obj.jsonrpc !== JSON_RPC_VERSION || !('id' in obj)) return false;

  // id must be string, number, or null (for parse errors)
  const id = obj.id;
  if (id !== null && !isValidJsonRpcId(id)) return false;

  // Must have result XOR error (not both, not neither)
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;
  return (hasResult || hasError) && !(hasResult && hasError);
}

/**
 * Check if response is a success response
 */
export function isJsonRpcSuccessResponse<T>(
  response: JsonRpcResponse<T>
): response is JsonRpcSuccessResponse<T> {
  return 'result' in response;
}

/**
 * Check if response is an error response
 */
export function isJsonRpcErrorResponse(
  response: JsonRpcResponse
): response is JsonRpcErrorResponse {
  return 'error' in response;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * JSON-RPC Error
 */
export class RpcError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'RpcError';
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  /**
   * Create from JSON-RPC error object
   */
  static fromJsonRpcError(error: JsonRpcError): RpcError {
    return new RpcError(error.message, error.code, error.data);
  }
}

/**
 * Connection Error
 */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Timeout Error
 */
export class RpcTimeoutError extends Error {
  constructor(
    public readonly method: string,
    public readonly timeout: number
  ) {
    super(`RPC call '${method}' timed out after ${timeout}ms`);
    this.name = 'RpcTimeoutError';
    Object.setPrototypeOf(this, RpcTimeoutError.prototype);
  }
}
