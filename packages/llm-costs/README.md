<div align="center">

# @gertsai/llm-costs

### LLM model costs, capabilities, and provider registry

A typed catalogue of **2,600+ models** across **100+ providers** — pricing, context windows,
capability flags, and endpoint metadata. Sourced from LiteLLM, normalized for TypeScript,
shipped as dual ESM + CJS with zero runtime dependencies.

</div>

---

## Why @gertsai/llm-costs

<table>
<tr>
<td width="50%">

### Without it
- Hardcoded `$2.50 / 1M tokens` literals in three repos
- "Does this model support vision?" — grep through vendor docs
- Silent drift when OpenAI drops prices
- Per-token vs per-million math errors in prod

</td>
<td width="50%">

### With it
- One source of truth — `getModel('gpt-4o').tokenPricing`
- Typed capability flags — `m.capabilities.vision`
- `pnpm sync` re-pulls LiteLLM in seconds
- `toPerMillion()` / `toPerToken()` helpers, no manual zeros

</td>
</tr>
</table>

Tier 1 package: **no internal dependencies**. Safe to consume from any layer of the GertsAI
stack — gateways, schedulers, billing, dashboards.

## Install

```bash
pnpm add @gertsai/llm-costs
# or
npm i @gertsai/llm-costs
```

Requires Node 18+. Works in browsers (the JSON dataset is ~1–2 MB; tree-shake or lazy-load
if bundle size matters).

## Quickstart

```ts
import {
  getModel,
  calculateCost,
  filterModels,
  toPerMillion,
  formatCost,
  getProvider,
  getCheapestChatModels,
} from '@gertsai/llm-costs';

// 1. Look up a model
const gpt4o = getModel('gpt-4o');
console.log(toPerMillion(gpt4o!.tokenPricing.input)); // 2.5  ($2.50 / 1M)

// 2. Calculate spend for a real request
const cost = calculateCost('gpt-4o', { inputTokens: 15_000, outputTokens: 5_000 });
console.log(formatCost(cost!.totalCost)); // "$0.09"

// 3. Find cheap vision-capable chat models under $3 / 1M input
const cheapVision = filterModels({
  mode: 'chat',
  capability: 'vision',
  maxInputCostPerToken: 3e-6,
  excludeDeprecated: true,
});

// 4. Provider metadata (endpoints, base URL, API-keys page)
const anthropic = getProvider('anthropic');
console.log(anthropic?.endpoints.batches);  // true
console.log(anthropic?.apiKeysPage);        // https://console.anthropic.com/settings/keys

// 5. Top 10 cheapest chat models, sorted
const top10 = getCheapestChatModels(10);
```

## What you get

| | |
|:---|:---|
| **Model registry** | 2,600+ entries indexed by id, provider, and mode for O(1) lookup |
| **Cost lookup** | Per-token pricing for input, output, reasoning, cache read/write, batch, priority, audio |
| **Capability flags** | `vision`, `functionCalling`, `reasoning`, `promptCaching`, `pdfInput`, `audioInput`, `webSearch`, `computerUse`, and 10 more |
| **Provider registry** | 30+ first-class providers with endpoint matrix, base URLs, health-check paths, alias resolution |
| **Cost calculator** | `calculateCost(modelId, usage)` — handles cached input tokens and reasoning tokens correctly |
| **Filtering & ranking** | `filterModels`, `getCheapestChatModels`, `getLargestContextModels`, by-mode and by-capability indexes |
| **Freshness metadata** | `getMeta()` returns `generatedAt`, `source`, `totalModels`, `byMode` counts |
| **Dual ESM + CJS** | Conditional `exports` map, `.d.ts` for both, no runtime deps |

## API surface

**Model lookup** (`./models`)

```ts
getModel(id)                       getModelsByProvider(provider)
findModel(query)                   getModelsByMode(mode)
getAllModels()                     getModelsByCapability(cap)
getAllModelIds()                   filterModels(filter)
getUniqueProviders()               getModelCountByProvider()
getUniqueModes()                   getModelCountByMode()
getCheapestChatModels(limit?)      getCheapestEmbeddingModels(limit?)
getLargestContextModels(limit?)    getMeta()
```

**Cost** (`./cost`)

```ts
calculateCost(modelId, usage)        calculateCostFromPricing(pricing, usage)
compareCosts(modelIds, usage)        getPricingSummary(modelId)
toPerMillion(perToken)               toPerToken(perMillion)
formatPrice(perToken, decimals?)     formatCost(usd, decimals?)
```

**Providers** (`./providers`)

```ts
PROVIDERS                getProvider(key)
getAllProviders()        getProviderKeys()
```

**Types** — `ModelInfo`, `ModelMode`, `TokenPricing`, `ImagePricing`, `MediaPricing`,
`RerankPricing`, `SearchPricing`, `ModelCapabilities`, `ModelFilter`, `CostInput`,
`CostResult`, `ProviderConfig`, `ProviderEndpoints`, plus the `ONE_MILLION` constant.

## Data sources

Pricing and capability data is generated from
[LiteLLM's `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm) by
`scripts/sync-litellm.ts`, normalized into per-token format and indexed by `provider`,
`mode`, and `capability`. Re-run `pnpm --filter @gertsai/llm-costs sync` to pull the latest
snapshot — `getMeta().generatedAt` reports the timestamp baked into the bundle. Provider
endpoint metadata in `src/providers.ts` is hand-curated and reviewed on every sync.

## Status

Version **0.1.0** — pre-1.0. The data shape is stable and exhaustively typed, but minor
field additions (new capability flags, new pricing dimensions) may land in 0.x without a
major bump. Pin a version if you ship to production billing paths.

## License

[Apache-2.0](./LICENSE)
