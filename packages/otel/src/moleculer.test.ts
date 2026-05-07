// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import type { BrokerOptions } from 'moleculer';
import { withMoleculerTracing } from './moleculer';

describe('@gertsai/otel/moleculer withMoleculerTracing', () => {
  it('adds a tracing block with default endpoint + full sampling', () => {
    const input: BrokerOptions = { nodeID: 'orders-1' };
    const result = withMoleculerTracing(input);

    const tracing = (result as { tracing?: Record<string, unknown> }).tracing;
    expect(tracing).toBeDefined();
    expect(tracing?.enabled).toBe(true);
    expect(tracing?.sampling).toEqual({ rate: 1 });
    expect(tracing?.exporter).toEqual({
      type: 'Zipkin',
      options: { endpoint: 'http://localhost:9411/api/v2/spans' },
    });
    // Original options are preserved.
    expect(result.nodeID).toBe('orders-1');
  });

  it('honours custom sampling ratio and OTLP endpoint', () => {
    const result = withMoleculerTracing(
      { nodeID: 'svc' },
      { otlpEndpoint: 'http://collector:9411/api/v2/spans', sampling: 0.25 },
    );
    const tracing = (result as { tracing?: Record<string, unknown> }).tracing;
    expect(tracing?.sampling).toEqual({ rate: 0.25 });
    expect((tracing?.exporter as { options: { endpoint: string } }).options.endpoint).toBe(
      'http://collector:9411/api/v2/spans',
    );
  });

  it('does not mutate the input BrokerOptions', () => {
    const input = { nodeID: 'svc' } as BrokerOptions & { tracing?: unknown };
    const before = JSON.stringify(input);
    withMoleculerTracing(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.tracing).toBeUndefined();
  });

  it('lets explicit consumer tracing keys win (overlay semantics)', () => {
    const input = {
      nodeID: 'svc',
      tracing: { enabled: false, sampling: { rate: 0.01 } },
    } as BrokerOptions;
    const result = withMoleculerTracing(input, { sampling: 1 });
    const tracing = (result as { tracing?: Record<string, unknown> }).tracing;
    // Consumer's explicit values win.
    expect(tracing?.enabled).toBe(false);
    expect(tracing?.sampling).toEqual({ rate: 0.01 });
    // But unspecified fields fall back to defaults.
    expect(tracing?.exporter).toEqual({
      type: 'Zipkin',
      options: { endpoint: 'http://localhost:9411/api/v2/spans' },
    });
  });
});
