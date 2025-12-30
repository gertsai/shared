/**
 * Tests for JSON-RPC types and type guards
 */

import { describe, it, expect } from 'vitest';
import {
  JSON_RPC_VERSION,
  JsonRpcErrorCode,
  isValidJsonRpcId,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
  RpcError,
  ConnectionError,
  RpcTimeoutError,
} from '../types.js';

describe('JSON-RPC Constants', () => {
  it('should have correct version', () => {
    expect(JSON_RPC_VERSION).toBe('2.0');
  });

  it('should have standard error codes', () => {
    expect(JsonRpcErrorCode.PARSE_ERROR).toBe(-32700);
    expect(JsonRpcErrorCode.INVALID_REQUEST).toBe(-32600);
    expect(JsonRpcErrorCode.METHOD_NOT_FOUND).toBe(-32601);
    expect(JsonRpcErrorCode.INVALID_PARAMS).toBe(-32602);
    expect(JsonRpcErrorCode.INTERNAL_ERROR).toBe(-32603);
  });
});

describe('Type Guards', () => {
  describe('isValidJsonRpcId', () => {
    it('should return true for string id', () => {
      expect(isValidJsonRpcId('abc')).toBe(true);
      expect(isValidJsonRpcId('123')).toBe(true);
      expect(isValidJsonRpcId('')).toBe(true);
    });

    it('should return true for number id', () => {
      expect(isValidJsonRpcId(1)).toBe(true);
      expect(isValidJsonRpcId(0)).toBe(true);
      expect(isValidJsonRpcId(-1)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidJsonRpcId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidJsonRpcId(undefined)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isValidJsonRpcId({})).toBe(false);
      expect(isValidJsonRpcId({ id: 1 })).toBe(false);
    });

    it('should return false for array', () => {
      expect(isValidJsonRpcId([])).toBe(false);
      expect(isValidJsonRpcId([1])).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(isValidJsonRpcId(true)).toBe(false);
      expect(isValidJsonRpcId(false)).toBe(false);
    });
  });

  describe('isJsonRpcRequest', () => {
    it('should return true for valid request', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: { foo: 'bar' },
      };
      expect(isJsonRpcRequest(request)).toBe(true);
    });

    it('should return true for request without params', () => {
      const request = {
        jsonrpc: '2.0',
        id: 'abc',
        method: 'test',
      };
      expect(isJsonRpcRequest(request)).toBe(true);
    });

    it('should return false for notification (no id)', () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'test',
      };
      expect(isJsonRpcRequest(notification)).toBe(false);
    });

    it('should return false for invalid jsonrpc version', () => {
      const request = {
        jsonrpc: '1.0',
        id: 1,
        method: 'test',
      };
      expect(isJsonRpcRequest(request)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isJsonRpcRequest(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isJsonRpcRequest(undefined)).toBe(false);
    });
  });

  describe('isJsonRpcNotification', () => {
    it('should return true for valid notification', () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'test',
        params: { foo: 'bar' },
      };
      expect(isJsonRpcNotification(notification)).toBe(true);
    });

    it('should return true for notification without params', () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'test',
      };
      expect(isJsonRpcNotification(notification)).toBe(true);
    });

    it('should return false for request (has id)', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };
      expect(isJsonRpcNotification(request)).toBe(false);
    });
  });

  describe('isJsonRpcResponse', () => {
    it('should return true for success response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: { data: 'test' },
      };
      expect(isJsonRpcResponse(response)).toBe(true);
    });

    it('should return true for error response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
      expect(isJsonRpcResponse(response)).toBe(true);
    });

    it('should return true for error response with null id (parse error)', () => {
      // Per JSON-RPC spec, id should be null if parse error occurred
      const response = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      expect(isJsonRpcResponse(response)).toBe(true);
    });

    it('should return false for invalid id type', () => {
      const response = {
        jsonrpc: '2.0',
        id: { invalid: true },
        result: 'test',
      };
      expect(isJsonRpcResponse(response)).toBe(false);
    });

    it('should return false for request', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };
      expect(isJsonRpcResponse(request)).toBe(false);
    });

    it('should return false if both result and error present (XOR violation)', () => {
      const invalid = {
        jsonrpc: '2.0',
        id: 1,
        result: 'success',
        error: { code: -32000, message: 'Error' },
      };
      expect(isJsonRpcResponse(invalid)).toBe(false);
    });

    it('should return false if neither result nor error present', () => {
      const invalid = {
        jsonrpc: '2.0',
        id: 1,
      };
      expect(isJsonRpcResponse(invalid)).toBe(false);
    });
  });

  describe('isJsonRpcSuccessResponse', () => {
    it('should return true for success response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: { data: 'test' },
      };
      expect(isJsonRpcSuccessResponse(response)).toBe(true);
    });

    it('should return false for error response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
      expect(isJsonRpcSuccessResponse(response)).toBe(false);
    });
  });

  describe('isJsonRpcErrorResponse', () => {
    it('should return true for error response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
      expect(isJsonRpcErrorResponse(response)).toBe(true);
    });

    it('should return false for success response', () => {
      const response = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: { data: 'test' },
      };
      expect(isJsonRpcErrorResponse(response)).toBe(false);
    });
  });
});

describe('Error Classes', () => {
  describe('RpcError', () => {
    it('should create with message and code', () => {
      const error = new RpcError('Test error', -32600);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(-32600);
      expect(error.name).toBe('RpcError');
      expect(error.data).toBeUndefined();
    });

    it('should create with data', () => {
      const error = new RpcError('Test error', -32600, { field: 'test' });
      expect(error.data).toEqual({ field: 'test' });
    });

    it('should create from JsonRpcError', () => {
      const jsonError = {
        code: -32601,
        message: 'Method not found',
        data: { method: 'unknown' },
      };
      const error = RpcError.fromJsonRpcError(jsonError);
      expect(error.code).toBe(-32601);
      expect(error.message).toBe('Method not found');
      expect(error.data).toEqual({ method: 'unknown' });
    });

    it('should be instanceof Error', () => {
      const error = new RpcError('Test', -32600);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RpcError);
    });
  });

  describe('ConnectionError', () => {
    it('should create with message', () => {
      const error = new ConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('ConnectionError');
    });

    it('should be instanceof Error', () => {
      const error = new ConnectionError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConnectionError);
    });
  });

  describe('RpcTimeoutError', () => {
    it('should create with method and timeout', () => {
      const error = new RpcTimeoutError('graph.query', 5000);
      expect(error.method).toBe('graph.query');
      expect(error.timeout).toBe(5000);
      expect(error.message).toBe("RPC call 'graph.query' timed out after 5000ms");
      expect(error.name).toBe('RpcTimeoutError');
    });

    it('should be instanceof Error', () => {
      const error = new RpcTimeoutError('test', 1000);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RpcTimeoutError);
    });
  });
});
