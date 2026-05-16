/**
 * @gertsai/core - base-url-validator tests
 * Wave 12.D-fix per EVID-051 S-3 / CWE-918 (SSRF + credential exfiltration).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateBaseUrl } from './base-url-validator';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';

describe('validateBaseUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default when baseUrl is undefined', () => {
    expect(validateBaseUrl(undefined, 'https://api.openai.com/v1', 'OpenAI')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('accepts the well-known default silently (no warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = validateBaseUrl(
      'https://api.anthropic.com/v1',
      'https://api.anthropic.com/v1',
      'Anthropic',
    );
    expect(result).toBe('https://api.anthropic.com/v1');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a non-default https proxy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = validateBaseUrl(
      'https://myproxy.example/v1',
      'https://api.openai.com/v1',
      'OpenAI',
    );
    expect(result).toBe('https://myproxy.example/v1');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/baseUrl override/);
  });

  it('throws on plain http for non-loopback host', () => {
    expect(() =>
      validateBaseUrl('http://malicious.example/', 'https://api.openai.com/v1', 'OpenAI'),
    ).toThrow(/must use https/);
  });

  it('allows http://localhost', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      validateBaseUrl('http://localhost:9999/v1', 'https://api.openai.com/v1', 'OpenAI'),
    ).toBe('http://localhost:9999/v1');
  });

  it('allows http://127.0.0.1', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      validateBaseUrl('http://127.0.0.1:11434/v1', 'https://api.openai.com/v1', 'OpenAI'),
    ).toBe('http://127.0.0.1:11434/v1');
  });

  it('allows http://[::1] (IPv6 loopback)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      validateBaseUrl('http://[::1]:11434/v1', 'https://api.openai.com/v1', 'OpenAI'),
    ).toBe('http://[::1]:11434/v1');
  });

  it('throws on invalid URL', () => {
    expect(() => validateBaseUrl('not-a-url', 'https://api.openai.com/v1', 'OpenAI')).toThrow(
      /invalid baseUrl/,
    );
  });
});

describe('Provider constructors reject malicious baseUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OpenAIProvider throws on http://malicious', () => {
    expect(
      () =>
        new OpenAIProvider({
          model: 'gpt-4o',
          apiKey: 'test',
          baseUrl: 'http://malicious.example/',
        }),
    ).toThrow(/must use https/);
  });

  it('OpenAIProvider allows http://localhost loopback', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new OpenAIProvider({
      model: 'gpt-4o',
      apiKey: 'test',
      baseUrl: 'http://localhost:9999',
    });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('AnthropicProvider throws on http://malicious', () => {
    expect(
      () =>
        new AnthropicProvider({
          model: 'claude-3-5-sonnet-20241022',
          apiKey: 'test',
          baseUrl: 'http://malicious.example/',
        }),
    ).toThrow(/must use https/);
  });

  it('GeminiProvider throws on http://malicious', () => {
    expect(
      () =>
        new GeminiProvider({
          model: 'gemini-1.5-pro',
          apiKey: 'test',
          baseUrl: 'http://malicious.example/',
        }),
    ).toThrow(/must use https/);
  });

  it('warns on non-default https proxy (OpenAI)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new OpenAIProvider({
      model: 'gpt-4o',
      apiKey: 'test',
      baseUrl: 'https://proxy.internal.example/v1',
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does NOT warn when baseUrl matches the default (OpenAI)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new OpenAIProvider({
      model: 'gpt-4o',
      apiKey: 'test',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
