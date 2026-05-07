// SPDX-License-Identifier: Apache-2.0
/**
 * OpenFGA authorization model drift guard — Wave 6 §OpenFGA-model-drift-CI.
 *
 * `scripts/openfga-bootstrap.ts` carries an inline `AUTHORIZATION_MODEL`
 * JSON constant that gets written to OpenFGA at deploy time. The canonical
 * human-readable form lives in `openfga/model.fga` (DSL). Sprint 3.11
 * Post-Build audit Track 2 §P1-3 flagged the dual-source-of-truth as a
 * silent-drift hazard: edit the DSL, forget to update the JSON (or vice
 * versa), and bootstrap quietly provisions a different authorization graph
 * than the docs document.
 *
 * This test parses `openfga/model.fga` via `@openfga/syntax-transformer`
 * (a devDependency — never runs in production rollout) and asserts the
 * result is structurally identical to the inlined JSON. CI fails on any
 * drift.
 *
 * Trade-off chosen (vs. parsing DSL at runtime in the bootstrap script):
 *   keep the bootstrap script parser-free — production rollout cannot be
 *   broken by an ANTLR-parser regression in `@openfga/syntax-transformer`.
 *   The DSL is canonical to humans; the JSON is canonical to OpenFGA; the
 *   test enforces equivalence so neither drifts.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';
import { transformer } from '@openfga/syntax-transformer';

import { AUTHORIZATION_MODEL } from '../scripts/openfga-bootstrap';

const MODEL_FGA_PATH = path.resolve(__dirname, '..', 'openfga', 'model.fga');

describe('OpenFGA authorization model drift guard (Wave 6 §OpenFGA-model-drift-CI)', () => {
  it('parses openfga/model.fga without error', async () => {
    const dsl = await fs.readFile(MODEL_FGA_PATH, 'utf8');
    expect(() => transformer.transformDSLToJSONObject(dsl)).not.toThrow();
  });

  it('inline JSON in scripts/openfga-bootstrap.ts matches parsed openfga/model.fga', async () => {
    const dsl = await fs.readFile(MODEL_FGA_PATH, 'utf8');
    const parsed = transformer.transformDSLToJSONObject(dsl);

    // The transformer drops `type_definitions` entries with no relations into
    // an empty object form, which deep-equal handles fine. Use `toEqual`
    // (structural) — `as const` + readonly arrays vs mutable arrays are
    // tolerated by vitest's deep equality.
    expect(parsed.schema_version).toBe(AUTHORIZATION_MODEL.schema_version);
    expect(parsed.type_definitions).toEqual(AUTHORIZATION_MODEL.type_definitions);
  });

  it('every relation referenced in document.metadata exists in document.relations', () => {
    const docDef = AUTHORIZATION_MODEL.type_definitions.find(
      (t) => t.type === 'document',
    );
    expect(docDef).toBeDefined();
    const relations = Object.keys(docDef!.relations ?? {});
    const metaKeys = Object.keys(docDef!.metadata?.relations ?? {});
    for (const k of metaKeys) {
      expect(relations).toContain(k);
    }
  });
});
