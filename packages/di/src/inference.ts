// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Additive type-level inference helpers for service identifiers.
 *
 * These aliases extract the carried `ServiceType` brand from a
 * {@link ServiceIdentifier} value at the type level. They are pure
 * compile-time utilities — no runtime cost, no impact on existing
 * declarations — that smooth out generic plumbing in consumer code.
 *
 * Originally-inspired-by: Orchestra orchlab/di's `InferServiceFromIdentifier`
 * (Apache 2.0). The orchlab version is paired with an args-bearing
 * `ServiceIdentifier<T, Args>`; we adopt only the type-level extraction
 * here, against `@gertsai/di`'s existing single-parameter shape, so as not
 * to alter the runtime API.
 */

import type { ServiceIdentifier, ServiceType } from './types';

/**
 * Extracts the carried service type from a {@link ServiceIdentifier}.
 *
 * Useful when writing generic helpers parameterised over an identifier:
 * the helper can compute its own service type without the caller passing
 * it explicitly.
 *
 * @template Identifier - A {@link ServiceIdentifier} value's static type
 *
 * @example
 * ```typescript
 * const profileId = createIdentifier<ProfileService>('profile');
 * type Resolved = InferServiceFromIdentifier<typeof profileId>;
 * // Resolved === ProfileService
 *
 * function describe<I extends ServiceIdentifier<any>>(id: I): string {
 *   const svc: InferServiceFromIdentifier<I> = diContainer.$sd.get(id);
 *   return svc.constructor.name;
 * }
 * ```
 */
export type InferServiceFromIdentifier<
  Identifier extends ServiceIdentifier<any>,
> = Identifier extends ServiceIdentifier<infer Service> ? Service : never;

/**
 * Convenience alias for the always-broad upper bound of identifiers.
 *
 * Matches any service identifier irrespective of the carried `ServiceType`,
 * useful as the constraint in generic code that doesn't care about the
 * specific service type — only that the value is *some* identifier.
 *
 * @example
 * ```typescript
 * function track(id: AnyServiceIdentifier) {
 *   metrics.observe('di.lookup', { id: id.toString() });
 * }
 * ```
 */
export type AnyServiceIdentifier = ServiceIdentifier<ServiceType>;
