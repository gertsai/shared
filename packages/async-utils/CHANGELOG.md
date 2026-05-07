# @gertsai/async-utils

## 0.1.0

### Minor Changes

- Initial release. Tier 1 zero-dep async utilities extracted from Orchestra (Sprint 3.9, Wave 5 Phase 4).
- API: `sleep`, `withTimeout`, `defer`, `debounce`, `throttle`, `retry`, `makeCancellable`.
- Per ADR-009 Decision A + invariants I-1 (zero `@gertsai/*` peer-deps), I-2 (standard `Error` for timeouts), I-16 (AbortSignal cleanup), I-17 (default `jitter: 'full'`).
