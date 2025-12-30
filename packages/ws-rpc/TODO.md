# @gerts/ws-rpc — TODO

> Audit Date: 2025-12-26
> Status: 107 tests passing
> Last Updated: 2025-12-26

## Fixed Issues ✅

### ~~CRITICAL-001: No Message Size Limit~~ — FIXED
- Added `maxMessageSize` option (default: 1MB)
- Validates message size before processing
- Emits error event if exceeded

### ~~CRITICAL-004: Unbounded pendingRequests~~ — FIXED
- Added `maxPendingRequests` option (default: 1000)
- Rejects new requests when limit reached

### ~~HIGH-001: Fix XOR Logic in Type Guard~~ — FIXED
- `isJsonRpcResponse` now correctly checks XOR (result OR error, not both)

### ~~HIGH-002: Clean Pending on Disconnect~~ — FIXED
- `disconnect()` now calls `rejectAllPending()`
- Prevents memory leaks and hanging promises

---

## Remaining Issues

### CRITICAL-002: No Rate Limiting
**File:** `src/client.ts:231`
**Risk:** CPU exhaustion from message flood

```typescript
// Implement sliding window rate limiter
// Default: 1000 messages/second
```

### CRITICAL-003: console.error Usage
**File:** `src/subscription.ts:109`
**Risk:** No structured logging

```typescript
// Replace:
console.error(`Error in subscription callback...`);

// With:
this.logger?.error('Subscription callback error', { topic, error });
// Or emit event
```

---

## Medium Priority

### MEDIUM-001: Token Refresh on Reconnect
**File:** `src/client.ts:456`

```typescript
// Add to WsRpcOptions:
onBeforeReconnect?: () => Promise<Record<string, string> | void>;

// Call before reconnect to refresh auth headers
```

### MEDIUM-002: URL Validation
**File:** `src/client.ts:181`

```typescript
private validateUrl(url: string): void {
  const parsed = new URL(url);
  if (!['ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Invalid WebSocket URL scheme: ${parsed.protocol}`);
  }
}
```

### MEDIUM-003: ID Counter Overflow
**File:** `src/client.ts:599`

```typescript
// Risk: After 2^53 calls, Number loses precision
// Solution: Use BigInt or reset counter periodically
```

### MEDIUM-004: Silent JSON Parse Failures
**File:** `src/client.ts:366`

```typescript
// Add better error context for debugging
```

---

## Low Priority

### LOW-001: Method Name Validation
Validate method names don't contain special characters.

### LOW-002: Heartbeat Separation (SRP)
Extract heartbeat logic to separate class.

### LOW-003: WebSocket Factory (DIP)
Make WebSocket injectable for testing and custom implementations.

---

## Test Coverage

| File | Tests |
|------|-------|
| types.test.ts | 37 |
| reconnect.test.ts | 20 |
| subscription.test.ts | 27 |
| client.test.ts | 23 |
| **Total** | **107** |

---

## Review Summary

| Category | Rating | Notes |
|----------|--------|-------|
| TypeScript | 95% | Minor branded type opportunities |
| Architecture | 8.5/10 | Good event-driven design |
| Code Quality | 85/100 | Fixed critical issues |
| Security | 8/10 | Size/count limits added |

**Previous Rating:** Security 6/10 → **Now: 8/10** after fixes
