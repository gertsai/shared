// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gertsai/session';
import type { FeatureContextInit } from './feature-context.js';
import type { ProviderContextInit } from './provider-context.js';

/**
 * Construction options for {@link RequestContext}. All fields optional —
 * an empty init is valid; getters throw when accessed before a `$set*`
 * mutator has been called or before a default applies.
 */
export interface RequestContextInit {
  readonly session?: Session;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly locale?: string;
  readonly features?: FeatureContextInit;
  readonly providers?: ProviderContextInit;
}
