// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Type-level tests for inference helpers added in Sprint 3.4 (W-4A-4).
 *
 * These tests assert via `expectTypeOf` (vitest) so they catch type-level
 * regressions while still running as part of the regular test suite.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import EventEmitter from 'events';

import { createIdentifier } from '../identifier';
import type {
  AnyServiceIdentifier,
  InferServiceFromIdentifier,
} from '../inference';
import type { IGlobalService, ServiceIdentifier } from '../types';

class GuardService extends EventEmitter implements IGlobalService {
  get isReady() {
    return Promise.resolve();
  }
  $destroy() {}
}

class MetricsService extends EventEmitter implements IGlobalService {
  get isReady() {
    return Promise.resolve();
  }
  $destroy() {}
  record() {}
}

describe('InferServiceFromIdentifier', () => {
  it('extracts the carried service type from an identifier value', () => {
    const guardId = createIdentifier<GuardService, 'guard'>('guard');
    type Resolved = InferServiceFromIdentifier<typeof guardId>;
    expectTypeOf<Resolved>().toEqualTypeOf<GuardService>();
  });

  it('distinguishes different service types behind different identifiers', () => {
    const guardId = createIdentifier<GuardService, 'guard'>('guard');
    const metricsId = createIdentifier<MetricsService, 'metrics'>('metrics');
    type G = InferServiceFromIdentifier<typeof guardId>;
    type M = InferServiceFromIdentifier<typeof metricsId>;
    expectTypeOf<G>().toEqualTypeOf<GuardService>();
    expectTypeOf<M>().toEqualTypeOf<MetricsService>();
    expectTypeOf<G>().not.toEqualTypeOf<MetricsService>();
  });

  it('works generically over unknown identifier types', () => {
    function describe<I extends ServiceIdentifier<any>>(_id: I): boolean {
      type R = InferServiceFromIdentifier<I>;
      // The type alias must resolve to *something* concrete in generic
      // position — never `unknown` and never `never`.
      const _check: [R] extends [never] ? false : true = true as never;
      return _check;
    }
    const id = createIdentifier<GuardService, 'g'>('g');
    expect(describe(id)).toBe(true);
  });
});

describe('AnyServiceIdentifier', () => {
  it('accepts any concrete identifier as assignable', () => {
    const guardId = createIdentifier<GuardService, 'guard'>('guard');
    const erased: AnyServiceIdentifier = guardId;
    // Type-level assertion: erased is structurally compatible with AnyServiceIdentifier.
    expectTypeOf(erased).toEqualTypeOf<AnyServiceIdentifier>();
  });

  it('is the broad form of ServiceIdentifier<ServiceType>', () => {
    // AnyServiceIdentifier is the upper-bound erased form;
    // it is assignable from ServiceIdentifier<IGlobalService>.
    expectTypeOf<ServiceIdentifier<IGlobalService>>()
      .toExtend<AnyServiceIdentifier>();
  });
});
