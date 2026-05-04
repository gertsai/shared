<div align="center">

# @gertsai/utils

### The boring, dependable utility belt for the Orchestra stack

A small, curated set of TypeScript helpers — async primitives, sort/group/guard helpers, a tagged
logger, LexoRank ordering, SSRF-aware URL validation, and a handful of types every package keeps
re-inventing. Tier 1: zero internal dependencies, dual ESM + CJS build.

[![npm](https://img.shields.io/badge/npm-%40gertsai%2Futils-cb3837?style=flat-square)](https://www.npmjs.com/package/@gertsai/utils)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Tier](https://img.shields.io/badge/tier-1-brightgreen?style=flat-square)](#status)
[![ESM + CJS](https://img.shields.io/badge/build-ESM%20%2B%20CJS-orange?style=flat-square)](#status)

</div>

---

## Why @gertsai/utils

- **Tier 1, no internal deps.** Sits at the bottom of the dependency graph — anything in the workspace can import it without creating a cycle.
- **Hand-picked, not a kitchen sink.** Every helper here was extracted from production code in the Orchestra stack. If it's exported, something real depends on it.
- **Strict types, JSDoc on everything.** Type guards narrow correctly (`nonNullable`), `Entries<T>` and `FlattenObject<T>` keep object code honest, and every helper ships with example-driven JSDoc.
- **Dual ESM + CJS.** Built for both module systems out of `dist/esm/` and `dist/cjs/` with separate type entries. Works in Node, in bundlers, and in CJS legacy hosts without flags.
- **Security on by default.** `validateWebhookUrl` blocks SSRF (RFC 1918 ranges, link-local, cloud metadata, IPv6-mapped IPv4, DNS-rebinding) — the safe default for outbound HTTP.

## Install

```sh
pnpm add @gertsai/utils
# or
npm i @gertsai/utils
```

Peer runtime: Node.js 18+ (uses `Buffer`, `URL`, `dns/promises`).

## Quickstart

**A deferred promise you can resolve from anywhere:**

```ts
import { DeferredPromise } from '@gertsai/utils';

const ready = new DeferredPromise<string>();

socket.on('open', () => ready.resolve('connected'));
socket.on('error', (err) => ready.reject(err));

const status = await ready.promise; // 'connected'
```

**A tagged logger with per-tag levels:**

```ts
import { createLogger, setLogLevels } from '@gertsai/utils';
import { LogLevels } from 'consola';

setLogLevels({ 'orchestra:di': LogLevels.debug });

const log = createLogger('orchestra:di');
log.debug('container booted', { modules: 12 });
```

**Stable list ordering with LexoRank (drag-and-drop friendly):**

```ts
import { makeOrderRank, createOrderRanksRepo, sortByOrderRank } from '@gertsai/utils';

const repo = createOrderRanksRepo([
  { _uid: 'a', order_rank: '0|hzzzzz:' },
  { _uid: 'b', order_rank: '0|i00007:' },
]);

const newRank = makeOrderRank({ repo, prev_uid: 'a', next_uid: 'b' });
// → a rank string strictly between 'a' and 'b' — no reindexing needed
```

## What you get

| Area | Highlights | Use it for |
|---|---|---|
| **Async** | `DeferredPromise`, `promiseTimeout` | Externally-resolvable promises, simple delays |
| **Logger** | `createLogger`, `setLogLevels`, `loggerInstances` | Tagged, per-namespace logging on top of `consola` |
| **Guards & Types** | `nonNullable`, `Entries<T>`, `FlattenObject<T>`, `UnionToIntersection<T>`, `NoUndefinedFieldShallow<T>` | Type-safe array filtering and structural type tricks |
| **Collections** | `groupBy`, `hGetFirst`, `hGetLast`, `arrayToObject` | Reshape arrays without pulling in lodash |
| **Sort** | `sortByName`, `sortByCreatedAt`, `sortByUpdatedAt`, `sortByOrderRank`, `sortByOrderRankOnly` | Drop-in `Array#sort` comparators for common shapes |
| **LexoRank** | `LexoRank`, `OrderRank`, `$lexoRank`, `makeOrderRank`, `createOrderRanksRepo` | Fractional ordering for reorderable lists |
| **Formatters / Converters** | `formatFileSize`, `limitString`, `convertName`, `convertDateStringToDate`, `convertDeltaToPlaintext`, `emojiToUnicode`, `encodeStringToBase64`, `decodeBase64ToString`, `strToNum` | Render bytes, truncate, parse human dates, Quill-delta → text |
| **Security** | `validateWebhookUrl`, `validateWebhookUrlAsync`, `isUrlSafe`, `parseAndValidateUrl`, `SsrfError` | SSRF-safe outbound URL validation (sync + DNS-rebinding-aware async) |
| **Strings** | `emailRegexp`, `plainUrlRegexp`, `markdownUrlRegexp`, `mentionRegexp`, `codeRegexp`, `timeRegexp`, `boldRegexp`, `italicRegexp`, plus `regexpToString` | Battle-tested regexes for chat / markdown content |
| **Data** | `colors`, `colorsMap`, `usernameColors`, `strToColorTag`, `getRandomColor`, `statusesIconsMap`, `statusIcons`, `getRandomStatusIcon`, `countriesArray` | Brand palette, status icon set, ISO country list |
| **Misc** | `getRandomId`, `getSyncFields`, `chatTargetSyncFields`, `ITimestamp`, `SortDirection`, `sortFactor`, `AppVersion`, `TextSelection` | The small things every package re-implements |

## API surface

Single entry: `import { ... } from '@gertsai/utils';`. Grouped by source module:

- **`async/`** — `DeferredPromise`, `promiseTimeout`
- **`collections/`** — `groupBy`, `hGetFirst`, `hGetLast`
- **`converters/`** — `arrayToObject`, `encodeStringToBase64`, `decodeBase64ToString`, `convertDateStringToDate` (with `DateString`, `DateTypes`), `convertDeltaToPlaintext`, `convertName`, `emojiToUnicode`, `strToNum`
- **`data/`** — `colorsMap`, `colors`, `usernameColors`, `strToColorTag`, `getRandomColor`, `ColorTag`, `statusesIconsMap`, `statusIcons`, `getRandomStatusIcon`, `countriesArray`
- **`formatters/`** — `formatFileSize`, `formatFileSizeParts`, `getFileSizeUnit`, `fileSizeUnits`, `limitString`
- **`generators/`** — `getRandomId`
- **`guards/`** — `nonNullable`, `NoUndefinedFieldShallow<T>`
- **`lexo-rank/`** — `LexoRank`, `OrderRank`, `$lexoRank`, `makeOrderRank` (`OrderRanksRepo`), `createOrderRanksRepo` (`OrderRanksRepoSource`)
- **`logger/`** — `createLogger`, `setLogLevels`, `loggerInstances`, `loggerLevels`, `ConsolaLogger`, `LogLevelOverrides`
- **`object/`** — `getSyncFields`, `chatTargetSyncFields`
- **`security/`** — `validateWebhookUrl`, `validateWebhookUrlAsync`, `isUrlSafe`, `isUrlSafeAsync`, `parseAndValidateUrl`, `SsrfError`, `UrlValidationOptions`
- **`sort/`** — `sortByName`, `sortByCreatedAt`, `sortByUpdatedAt`, `sortByOrderRank`, `sortByOrderRankOnly`
- **`string/`** — `regexpToString`, `codeRegexp`, `inlineCodeRegexp`, `expandableRegexp`, `mentionRegexp`, `timeRegexp`, `tagsRegexp`, `boldRegexp`, `italicRegexp`, `underlineRegexp`, `strikeRegexp`, `boldItalicUnderlinestrikeRegexp`, `emailRegexp`, `plainUrlRegexp`, `markdownUrlRegexp`
- **`timestamp/`** — `ITimestamp`
- **`types/`** — `Entries<T>`, `FlattenObject<T>`, `UnionToIntersection<T>`, `SortDirection`, `sortFactor`, `SortConfig`, `SortItem`, `SortDirectionConfig`, `TextSelection`, `AppVersion`

## Status

| | |
|---|---|
| **Version** | `0.1.0` |
| **Tier** | 1 — no internal `@gertsai/*` dependencies |
| **Build** | Dual ESM (`dist/esm/`) + CJS (`dist/cjs/`), types per format |
| **Runtime** | Node.js 18+ (uses `Buffer`, `URL`, `dns/promises`) |
| **External deps** | `consola` (logger), `lodash.get` (`groupBy` key access) |
| **Stability** | Pre-1.0 — public API may shift; breaking changes called out in changelog |

## License

[Apache-2.0](./LICENSE)
