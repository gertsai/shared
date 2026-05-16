// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 12.D-fix (PRD-036 FR-007 / FR-006).
 *
 *   - FR-007: REDACTION_KEYS expanded with 11 credential-family tokens
 *     (apitoken, accesstoken, refreshtoken, csrftoken, bearertoken,
 *     idtoken, sessionid, clientsecret, x-api-key, bearer, jwt).
 *   - FR-006: `redactDetails(details, customKeys?)` accepts an optional
 *     case-insensitive merge set so `@gertsai/logger-factory` can layer
 *     its consumer-provided `redact: string[]` over the defaults.
 */
import { describe, expect, it } from 'vitest';
import { REDACTION_KEYS, redactDetails } from '../redaction.js';

describe('REDACTION_KEYS — expanded credential surface (FR-007)', () => {
  it('includes the added token-family entries (camelCase + snake_case forms)', () => {
    const lower = new Set(REDACTION_KEYS.map((k) => k.toLowerCase()));
    // 11 camelCase / kebab-case forms named in PRD-036 FR-007 + 8
    // snake_case spellings of the same families so neither casing leaks.
    for (const k of [
      'apitoken',
      'api_token',
      'accesstoken',
      'access_token',
      'refreshtoken',
      'refresh_token',
      'csrftoken',
      'csrf_token',
      'bearertoken',
      'bearer_token',
      'idtoken',
      'id_token',
      'sessionid',
      'session_id',
      'clientsecret',
      'client_secret',
      'x-api-key',
      'bearer',
      'jwt',
    ]) {
      expect(lower.has(k)).toBe(true);
    }
  });

  it('redacts the camelCase + kebab-case credential keys', () => {
    const out = redactDetails({
      apiToken: 'sk-live-1',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      csrfToken: 'ct-1',
      bearerToken: 'bt-1',
      idToken: 'it-1',
      sessionId: 'sid-1',
      clientSecret: 'cs-1',
      'x-api-key': 'xak-1',
      bearer: 'b-1',
      jwt: 'j-1',
      keep: 'ok',
    });
    expect(out.apiToken).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.refreshToken).toBe('[REDACTED]');
    expect(out.csrfToken).toBe('[REDACTED]');
    expect(out.bearerToken).toBe('[REDACTED]');
    expect(out.idToken).toBe('[REDACTED]');
    expect(out.sessionId).toBe('[REDACTED]');
    expect(out.clientSecret).toBe('[REDACTED]');
    expect(out['x-api-key']).toBe('[REDACTED]');
    expect(out.bearer).toBe('[REDACTED]');
    expect(out.jwt).toBe('[REDACTED]');
    expect(out.keep).toBe('ok');
  });

  it('redacts the snake_case variants of the same families', () => {
    const out = redactDetails({
      api_token: 'sk-live-1',
      access_token: 'at-1',
      refresh_token: 'rt-1',
      csrf_token: 'ct-1',
      bearer_token: 'bt-1',
      id_token: 'it-1',
      session_id: 'sid-1',
      client_secret: 'cs-1',
    });
    expect(out.api_token).toBe('[REDACTED]');
    expect(out.access_token).toBe('[REDACTED]');
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out.csrf_token).toBe('[REDACTED]');
    expect(out.bearer_token).toBe('[REDACTED]');
    expect(out.id_token).toBe('[REDACTED]');
    expect(out.session_id).toBe('[REDACTED]');
    expect(out.client_secret).toBe('[REDACTED]');
  });
});

describe('redactDetails — customKeys overload (FR-006)', () => {
  it('merges custom keys with defaults (Set, lowercase)', () => {
    const out = redactDetails(
      { custom_field: 'x', password: 'y', keep: 'z' },
      new Set(['custom_field']),
    );
    expect(out.custom_field).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.keep).toBe('z');
  });

  it('merges custom keys with defaults (array, case-insensitive)', () => {
    const out = redactDetails(
      { Custom: 'x', token: 'y', keep: 'z' },
      ['CUSTOM'],
    );
    expect(out.Custom).toBe('[REDACTED]');
    expect(out.token).toBe('[REDACTED]');
    expect(out.keep).toBe('z');
  });

  it('null / undefined customKeys preserves default-only behaviour', () => {
    const out = redactDetails({ password: 'p', keep: 'k' }, null);
    expect(out.password).toBe('[REDACTED]');
    expect(out.keep).toBe('k');
  });

  it('custom keys propagate into nested objects (deep-redact)', () => {
    const out = redactDetails(
      { outer: { user: { custom_field: 'x', plain: 'y' } } },
      ['custom_field'],
    );
    const inner = (out.outer as Record<string, unknown>).user as Record<string, unknown>;
    expect(inner.custom_field).toBe('[REDACTED]');
    expect(inner.plain).toBe('y');
  });
});
