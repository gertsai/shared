// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import type { BrokerOptions } from 'moleculer';
import { buildTraceparent, withMoleculerTracing } from './moleculer';

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
    expect((tracing!.exporter as { options: { endpoint: string } }).options.endpoint).toBe(
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

  it('buildTraceparent returns undefined when tracing is falsy', () => {
    expect(buildTraceparent({})).toBeUndefined();
    expect(buildTraceparent({ tracing: false })).toBeUndefined();
    expect(buildTraceparent({ requestID: 'r', id: 's' })).toBeUndefined();
  });

  it('buildTraceparent assembles a W3C-compliant header', () => {
    const tp = buildTraceparent({
      tracing: true,
      requestID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      id: '11111111-2222-3333-4444',
      parentID: 'parent-1',
    });
    expect(tp).toBeDefined();
    expect(tp!.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(tp!.traceId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(tp!.parentId).toBe('parent-1');
    expect(tp!.sampled).toBe(true);
  });

  it('buildTraceparent enforces non-zero traceId + spanId (W3C spec)', () => {
    const tp = buildTraceparent({ tracing: true, requestID: '', id: '' });
    expect(tp).toBeDefined();
    // All-zero is replaced with a "<31 zeros>1" pattern.
    expect(tp!.traceparent).toBe(`00-${'0'.repeat(31)}1-${'0'.repeat(15)}1-01`);
  });

  it('buildTraceparent right-pads short IDs and strips dashes', () => {
    const tp = buildTraceparent({
      tracing: true,
      requestID: 'abc-def',
      id: '123',
    });
    expect(tp).toBeDefined();
    // 'abcdef' padded to 32; '123' padded to 16
    expect(tp!.traceparent).toMatch(/^00-abcdef[0]+-123[0]+-01$/);
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
