// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { asTenantId } from '@gertsai/tenant';

describe('Wave 37.B — TenantId runtime boundary', () => {
  it('creates a TenantId from a non-empty string', () => {
    expect(asTenantId('tenant-acme')).toBe('tenant-acme');
  });

  it('rejects an empty string with TypeError', () => {
    expect(() => asTenantId('')).toThrow(TypeError);
  });
});
