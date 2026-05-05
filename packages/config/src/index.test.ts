// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import * as configShim from './index';

describe('@gertsai/config shim', () => {
  it('re-exports loadConfig from @gertsai/api-core/runtime/node', () => {
    expect(configShim.loadConfig).toBeDefined();
    expect(typeof configShim.loadConfig).toBe('function');
  });

  it('re-exports createGcpLoggerStream from @gertsai/api-core/runtime/node', () => {
    expect(configShim.createGcpLoggerStream).toBeDefined();
    expect(typeof configShim.createGcpLoggerStream).toBe('function');
  });

  it('exports the same loadConfig identity as the canonical subpath', async () => {
    const canonical = await import('@gertsai/api-core/runtime/node');
    expect(configShim.loadConfig).toBe(canonical.loadConfig);
    expect(configShim.createGcpLoggerStream).toBe(canonical.createGcpLoggerStream);
  });

  it('loadConfig overlays process.env values onto a typed config object', () => {
    const KEY = '__GERTSAI_CONFIG_SHIM_TEST_VAR__';
    const original = process.env[KEY];
    try {
      process.env[KEY] = 'overridden';
      const cfg = configShim.loadConfig({ [KEY]: 'default' } as Record<string, string>);
      expect(cfg[KEY]).toBe('overridden');
    } finally {
      if (original === undefined) {
        delete process.env[KEY];
      } else {
        process.env[KEY] = original;
      }
    }
  });
});
