/**
 * Wave 12.D-fix / FR-002 / EVID-051 A-1:
 *
 * Confirms the package surface exports `RlrRequestContext` (canonical
 * name) and the legacy `RequestContext` alias resolves to the same
 * class — so existing consumers continue to compile.
 */
import { describe, expect, it } from 'vitest';

import * as api from '../index';

describe('RlrRequestContext export surface', () => {
  it('exports RlrRequestContext as the canonical class', () => {
    expect(api.RlrRequestContext).toBeDefined();
    expect(typeof api.RlrRequestContext).toBe('function');
  });

  it('exposes legacy RequestContext alias pointing to the same class', () => {
    expect(api.RequestContext).toBe(api.RlrRequestContext);
  });

  it('class name reflects the new identifier', () => {
    expect(api.RlrRequestContext.name).toBe('RlrRequestContext');
  });
});
