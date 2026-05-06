// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { redact } from '../redaction.js';

describe('redact', () => {
  it('redacts default REDACTION_KEYS shallow + nested (case-insensitive)', () => {
    const input = {
      username: 'alice',
      password: 'p@ss',
      Token: 'jwt',
      nested: { authorization: 'Bearer x', other: 'ok' },
    };
    const out = redact(input) as Record<string, unknown>;
    expect(out.username).toBe('alice');
    expect(out.password).toBe('[REDACTED]');
    expect(out.Token).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).other).toBe('ok');
  });

  it('extends defaults with consumer-supplied extra keys', () => {
    const input = { custom: 's', secret: 'x' };
    const out = redact(input, ['custom']) as Record<string, unknown>;
    expect(out.custom).toBe('[REDACTED]');
    expect(out.secret).toBe('[REDACTED]');
  });
});
