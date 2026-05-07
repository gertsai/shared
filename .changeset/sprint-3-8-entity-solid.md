---
"@gertsai/entity-solid": minor
---

Initial release of `@gertsai/entity-solid` — Solid.js framework adapter for `@gertsai/entity`. Ships `solidReactiveAdapter` (createStore + produce-backed reactive proxy with 3 Proxy traps for fine-grained Solid signal updates) and `useEntity` accessor. Module-private Symbol markers (CWE-1321 protected per ADR-008 I-11). Lazy peer-dep loading via `createRequire(import.meta.url)` (Amendment 1.2.9). Peer-optional `solid-js: >=1.0.0`. Per ADR-008 Decision D + SPEC-013 W-3-8-12..16 + Amendment 1 invariants I-11..I-14.
