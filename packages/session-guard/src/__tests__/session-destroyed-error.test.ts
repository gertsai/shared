// SPDX-License-Identifier: Apache-2.0
//
// Sprint 3.10 W-3-10-24 — Single-source identity test for SessionDestroyedError.
// Mitigates ADR-010 R-6: relocation could break `instanceof` if tsup bundles
// each package independently and the re-export shim spawns a duplicate class.
import { SessionDestroyedError as FromErrors } from '@gertsai/errors';
import { describe, expect, it } from 'vitest';

import { SessionDestroyedError as FromGuard } from '../errors.js';
import { SessionDestroyedError as FromGuardIndex } from '../index.js';

describe('SessionDestroyedError — single-source identity (ADR-010 §A1.1)', () => {
  it('class identity matches between @gertsai/errors and session-guard/errors', () => {
    expect(FromGuard).toBe(FromErrors);
  });

  it('class identity matches between @gertsai/errors and session-guard public surface', () => {
    expect(FromGuardIndex).toBe(FromErrors);
  });

  it('instance constructed via session-guard re-export is instanceof errors-source', () => {
    const err = new FromGuard({
      message: 'Cannot $switchOperator on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err).toBeInstanceOf(FromErrors);
    expect(err).toBeInstanceOf(FromGuard);
  });

  it('instance constructed via errors source is instanceof session-guard re-export', () => {
    const err = new FromErrors({
      message: 'Cannot $setDataAccessUuid on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err).toBeInstanceOf(FromGuard);
    expect(err).toBeInstanceOf(FromGuardIndex);
  });

  it('preserves verbatim Sprint 3.10 W-3-10-25 message', () => {
    const err = new FromGuard({
      message: 'Cannot $switchOperator on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err.message).toBe('Cannot $switchOperator on destroyed session');
    expect(err.details).toEqual({ contextField: 'session' });
  });
});
