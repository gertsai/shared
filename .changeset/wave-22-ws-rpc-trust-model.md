---
'@gertsai/ws-rpc': patch
---

Wave 22 — Documents the ws-rpc trust model per EVID-076 CP-3 (deferred from Wave 21).

README "Trust model" section explicitly states the 6 threat-model assumptions:
1. Server is trusted to send well-formed messages (payload-shape validation is consumer's)
2. Hostile server CAN DoS — mitigations as of Wave 21 (subscription patterns, message size, pending requests caps)
3. NO per-method rate limit (use @gertsai/api-rlr at JSON-RPC handler if needed)
4. NO backpressure signal toward server (callbacks should be O(1))
5. Reconnect is best-effort (after maxAttempts → ConnectionError + manual connect() required)
6. Heartbeat is liveness, not auth (token-refresh layer separate)

Plus 3 explicit non-threats (server reading client memory, privilege escalation, storage poisoning).

Docs-only patch bump.

Refs: PRD-058, EVID-076 CP-3, EVID-077 (Wave 21 mitigations now documented).
