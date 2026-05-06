// SPDX-License-Identifier: Apache-2.0
//
// Type-level checks for constraint factories. Uses vitest's built-in
// `expectTypeOf` (NOT the standalone `expect-type` package) — confirmed
// by parity with `packages/entity-audit/src/builders.test.ts` ~line 360.
//
// These tests are evaluated by `tsc --noEmit` and by Vitest's runtime; the
// `expectTypeOf(...).toEqualTypeOf<X>()` calls are pure type assertions
// at runtime (they always succeed). Their value is in the type-checker's
// reaction at compile time.

import { describe, expectTypeOf, it } from 'vitest';

import type { StorageMetadata } from '@gertsai/storage-core';
import { defineQueryConstraints, limit, orderBy, whereField } from '../constraints';
import type {
  LimitConstraint,
  OrderByConstraint,
  WhereConstraint,
} from '../types';

interface ProductRead {
  uid: string;
  name: string;
  price: number;
  tags: string[];
}

type ProductMeta = StorageMetadata<
  ProductRead,
  ProductRead,
  'uid' | 'name' | 'price' | 'tags'
>;

describe('whereField type-level constraints', () => {
  it('returns WhereConstraint<Meta, F> with F narrowed to the supplied literal', () => {
    const c = whereField<ProductMeta, 'name'>('name', '==', 'widget');
    expectTypeOf(c).toEqualTypeOf<WhereConstraint<ProductMeta, 'name'>>();
  });

  it('rejects fields not present in Meta["indexed"]', () => {
    // `description` is NOT in Meta['indexed'] = 'uid' | 'name' | 'price' | 'tags',
    // so passing it as the field literal must error at compile time.
    // @ts-expect-error - 'description' is not assignable to Meta['indexed']
    whereField<ProductMeta, 'description'>('description', '==', 'x');
  });

  it('the array-op overload requires an array value', () => {
    // @ts-expect-error - `in` requires ReadonlyArray<unknown>, not a scalar
    whereField<ProductMeta, 'name'>('name', 'in', 'oops');
  });
});

describe('orderBy / limit type-level constraints', () => {
  it('orderBy returns OrderByConstraint<Meta, F>', () => {
    const c = orderBy<ProductMeta, 'price'>('price', 'desc');
    expectTypeOf(c).toEqualTypeOf<OrderByConstraint<ProductMeta, 'price'>>();
  });

  it('limit returns LimitConstraint<Meta>', () => {
    const c = limit<ProductMeta>(10);
    expectTypeOf(c).toEqualTypeOf<LimitConstraint<ProductMeta>>();
  });
});

describe('defineQueryConstraints curried Meta narrowing (F3)', () => {
  it('captures Meta so .where infers F from the field literal alone', () => {
    const q = defineQueryConstraints<ProductMeta>();
    const c = q.where('name', '==', 'widget');
    // The bound `where` returns the same shape as the standalone factory.
    expectTypeOf(c).toEqualTypeOf<WhereConstraint<ProductMeta, 'name'>>();
  });

  it('rejects fields not in Meta["indexed"] without an explicit generic', () => {
    const q = defineQueryConstraints<ProductMeta>();
    // @ts-expect-error - 'description' is not in Meta['indexed'].
    q.where('description', '==', 'x');
  });

  it('orderBy / limit inherit the captured Meta', () => {
    const q = defineQueryConstraints<ProductMeta>();
    const o = q.orderBy('price', 'desc');
    expectTypeOf(o).toEqualTypeOf<OrderByConstraint<ProductMeta, 'price'>>();
    const l = q.limit(10);
    expectTypeOf(l).toEqualTypeOf<LimitConstraint<ProductMeta>>();
  });

  it('the array-op overload still requires an array value through the curry', () => {
    const q = defineQueryConstraints<ProductMeta>();
    // @ts-expect-error - `in` requires ReadonlyArray<unknown>, not a scalar.
    q.where('name', 'in', 'oops');
  });
});
