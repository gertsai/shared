---
"@gertsai/api-rlr": patch
---

feat(api-rlr): export the shared strategy contract types

Re-export `RateLimitStrategy`, `StrategyExecuteArgs` and `StrategyResult` from
`./strategies/RateLimitStrategy` in the package entrypoint. The concrete strategy
classes (`GCRAStrategy`, `SlidingWindowStrategy`, `LeakyBucketStrategy`) and
`StorageAdapter` were already exported, but their shared interface plus
argument/result types were not — so a consumer using a strategy directly by key
(its `execute({ key, limit, timeFrame, now })` API is suited for exactly that) had
to type against a concrete class instead of the interface. No new capability;
removes needless coupling.
