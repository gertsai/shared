# @gertsai/hsm

> Hardware Security Module integration for **convergent encryption** — the dedup-friendly crypto layer behind GertsAi CAS.

Same plaintext + same context = same ciphertext. Keys never leave the HSM boundary. Storage stays deduplicated even when everything on disk is encrypted.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Fhsm-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/hsm)
[![tier](https://img.shields.io/badge/tier-3-blue?style=flat-square)](#)
[![license](https://img.shields.io/badge/license-Apache--2.0-000?style=flat-square)](./LICENSE)

---

## Why @gertsai/hsm

- **Convergent encryption out of the box** — deterministic ciphertexts mean Content-Addressed Storage keeps deduplicating even after encryption.
- **Provider abstraction** — one `HSMProvider` interface, many backends: HashiCorp Vault Transit today, AWS KMS / Azure Key Vault tomorrow, Mock for tests.
- **Keys never leak** — encryption and decryption happen inside the HSM. The library only ever holds ciphertexts and key metadata.
- **Rotation without re-uploads** — `rewrap()` re-encrypts ciphertext under the new key version without touching plaintext.
- **Test-friendly** — `MockHSMProvider` is a drop-in implementation: same interface, no network, deterministic.

## Install

```sh
npm i @gertsai/hsm
# or
pnpm add @gertsai/hsm
```

Peer dependency: `@gertsai/core` (workspace).

## Quickstart

```typescript
import { ConvergentEncryption, MockHSMProvider } from '@gertsai/hsm';

// 1. Pick a provider (mock for tests; Vault for real)
const provider = new MockHSMProvider({
  provider: 'mock',
  enabled: true,
  timeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 100,
  fallbackMode: 'error',
});
await provider.connect();

// 2. Wrap it in the high-level service
const ce = new ConvergentEncryption({ provider });

// 3. Encrypt — storageId is your dedup key
const content = Buffer.from('Hello, CAS!');
const up = await ce.encrypt(content);
// up.storageId   -> SHA-256 of ciphertext (use for CAS dedup)
// up.contentHash -> SHA-256 of plaintext  (used as CE context)
// up.ciphertext  -> store this in your backend

// 4. Same content -> same storageId (dedup works)
const up2 = await ce.encrypt(content);
console.assert(up.storageId === up2.storageId);

// 5. Decrypt
const down = await ce.decrypt(up.ciphertext, up.contentHash);
console.assert(down.plaintext.equals(content));
console.assert(down.verified === true);
```

## What you get

| Feature | Description |
|---|---|
| `ConvergentEncryption` | High-level encrypt / decrypt / `computeStorageId` / `rewrap` over any provider. |
| `HSMProvider` interface | Contract: `connect`, `encrypt`, `decrypt`, `getKeyInfo`, `rotateKey`, `rewrap`, `healthCheck`. |
| Deterministic ciphertexts | Content hash is the CE context — identical plaintexts produce identical ciphertexts. |
| Hash verification | `verifyOnDecrypt` (default `true`) recomputes SHA-256 and reports tamper. |
| Key rotation + rewrap | `rotateKey()` bumps version; `rewrap()` migrates ciphertext without exposing plaintext. |
| Retry + circuit breaker | `withRetry`, `createCircuitBreaker` from `@gertsai/hsm` utils. |
| Typed errors | `HSMError` with `HSMErrorCodes` (CONNECTION_FAILED, ENCRYPT_FAILED, SEALED, ...) and `isRetryable`. |
| Pluggable telemetry | `HSMLogger` and `HSMMetrics` interfaces, `noopLogger` / `noopMetrics` defaults. |

## Providers

| Provider | Status | Use case |
|---|---|---|
| `MockHSMProvider` | Stable | Unit / integration tests, deterministic local dev. |
| `VaultProvider` (HashiCorp Vault Transit) | Stable | Production. Token / AppRole / Kubernetes auth, namespaces, custom CA. |
| AWS KMS | Planned | Future — same `HSMProvider` interface. |
| Azure Key Vault | Planned | Future — same `HSMProvider` interface. |

Pick a provider directly or via the factory:

```typescript
import { createHSMProvider, createMockProvider } from '@gertsai/hsm';

const vault = createHSMProvider({
  provider: 'vault',
  enabled: true,
  address: 'http://localhost:8200',
  authMethod: 'token',
  token: process.env.VAULT_TOKEN,
  transitMount: 'transit',
  keyName: 'gerts-ce-key',
  timeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  fallbackMode: 'error',
});

const mock = createMockProvider(); // sane defaults for tests
```

## API surface

Re-exported from `@gertsai/hsm`:

- **Service** — `ConvergentEncryption`, types `CEOptions`, `CEUploadResult`, `CEDownloadResult`, `CEDedupCheckResult`.
- **Providers** — `VaultProvider`, `MockHSMProvider`, factories `createHSMProvider`, `createMockProvider`.
- **Provider contract** — `HSMProvider`, results `EncryptResult`, `DecryptResult`, `KeyInfo`, `RotateKeyResult`, `RewrapResult`, `HealthCheckResult`.
- **Config** — `HSMConfig`, `VaultConfig`, `MockHSMConfig`, `HSMBaseConfig`, enums `HSMProviderTypes`, `VaultAuthMethods`.
- **Errors** — `HSMError`, `HSMErrorCodes`, type `HSMErrorCode`.
- **Telemetry** — `HSMLogger`, `HSMMetrics`, `noopLogger`, `noopMetrics`.
- **Utilities** — `withRetry`, `sleep`, `createCircuitBreaker`, `DEFAULT_RETRY_OPTIONS`, type `RetryOptions`.

Full TypeScript types ship with the package; `dist/index.d.ts` is the source of truth.

## Status

- **Tier:** 3 (security-critical infrastructure).
- **Version:** `0.1.0` — API stable, breaking changes will be flagged in the changelog.
- **Tests:** `vitest run` (unit) and `vitest run --config vitest.integration.config.ts` (Vault integration).
- **Node:** ESM + CJS dual build, Node 20+.

## License

[Apache-2.0](./LICENSE)
