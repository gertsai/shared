// SPDX-License-Identifier: Apache-2.0
export type {
  HttpRequestLike,
  TenantResolution,
  TenantResolverStrategy,
} from './strategy.js';
export {
  ChainTenantResolver,
  type ChainResolverMode,
  type ChainTenantResolverOptions,
} from './chain-resolver.js';
export { resolveTenantStrict } from './strict.js';
export { HeaderStrategy, type HeaderStrategyOptions } from './strategies/header.strategy.js';
export {
  SubdomainStrategy,
  type SubdomainStrategyOptions,
} from './strategies/subdomain.strategy.js';
export { PathStrategy, type PathStrategyOptions } from './strategies/path.strategy.js';
