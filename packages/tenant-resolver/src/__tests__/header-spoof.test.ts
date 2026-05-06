// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { HeaderStrategy } from '../strategies/header.strategy.js';

describe('HeaderStrategy adversarial: trustProxy must be opt-in (I-15 / security P0-1)', () => {
  it('throws when trustProxy is omitted', () => {
    expect(
      () =>
        new HeaderStrategy({
          headerName: 'X-Tenant-ID',
        } as unknown as { headerName: string; trustProxy: boolean }),
    ).toThrow(/trustProxy: true/);
  });

  it('throws when trustProxy is explicitly false', () => {
    expect(() => new HeaderStrategy({ headerName: 'X-Tenant-ID', trustProxy: false })).toThrow(
      /trustProxy: true/,
    );
  });

  it('throws when trustProxy is a truthy non-boolean (e.g. 1)', () => {
    expect(
      () =>
        new HeaderStrategy({
          headerName: 'X-Tenant-ID',
          trustProxy: 1 as unknown as boolean,
        }),
    ).toThrow(/trustProxy: true/);
  });

  it('throws on empty headerName even when trustProxy: true', () => {
    expect(() => new HeaderStrategy({ headerName: '   ', trustProxy: true })).toThrow(
      /non-empty headerName/,
    );
  });
});
