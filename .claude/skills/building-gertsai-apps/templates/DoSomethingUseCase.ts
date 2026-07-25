// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// 1) DOMAIN ENTITY — domain/<entity>.ts
//    Pure type + invariant-guarding factory. Only @gertsai import allowed in
//    the domain is the error taxonomy.
// ============================================================================
import { ValidationError } from '@gertsai/errors';

export interface FooMetadata {
  // TODO: optional, transport-free metadata fields
  readonly source?: string;
}

export interface Foo {
  readonly id: string;
  readonly text: string;
  readonly metadata?: FooMetadata;
}

/** Factory: validates invariants so use-cases can trust the entity. */
export const createFoo = (input: Foo): Foo => {
  if (!input.id || input.id.trim().length === 0) {
    throw new ValidationError({
      message: 'Foo.id must be non-empty',
      details: { field: 'id', constraint: 'non-empty' }, // TODO: never put secrets in details
    });
  }
  // TODO: add remaining invariant checks
  return {
    id: input.id,
    text: input.text,
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
};

// ============================================================================
// 2) OUTBOUND PORT — domain/ports/IFooStore.ts
//    Interface only. NEVER import a concrete adapter here. Apply ISP: keep the
//    interface as narrow as the consumer that needs it.
// ============================================================================
import type { Foo } from '../<entity>';

export interface IFooStore {
  /** Persist. Implementations document their upsert/throw policy. */
  save(doc: Foo): Promise<void>;
  /** Returns null when not found (and excludes soft-deleted rows). */
  findById(id: string): Promise<Foo | null>;
  // TODO: split read/query/delete concerns into separate interfaces per ISP,
  //       then `export type FullFooStore = IFooStore & IFooQuery & ...;`
}

// ============================================================================
// 3) USE-CASE — application/DoSomethingUseCase.ts
//    Class + constructor-injected deps (typed to PORTS, never impls). No I/O
//    except through ports. Optional session-guard assertions are additive.
// ============================================================================
import { InternalError, ValidationError } from '@gertsai/errors';
import type { Session } from '@gertsai/session';
import { assertAuthenticated, assertSessionInTenant } from '@gertsai/session-guard';

import { createFoo, type FooMetadata } from '../domain/<entity>';
import type { IFooStore } from '../domain/ports/IFooStore';
import type { IPermissionGate } from '../domain/ports/IPermissionGate';
import { permissionDenied } from '../shared/errors';

export interface DoSomethingDeps {
  readonly fooStore: IFooStore;
  readonly gate: IPermissionGate;
  // TODO: add other ports (embedder, chunkStore, ...)
}

export interface DoSomethingInput {
  readonly userId: string;
  readonly docId: string;
  readonly text: string;
  readonly metadata?: FooMetadata;
  readonly session?: Session;          // optional, additive
  readonly expectedTenantId?: string;  // optional, additive
}

export interface DoSomethingResult {
  readonly docId: string;
}

export class DoSomethingUseCase {
  constructor(private readonly deps: DoSomethingDeps) {}

  async execute(input: DoSomethingInput): Promise<DoSomethingResult> {
    const { userId, docId, text, metadata, session, expectedTenantId } = input;
    const { gate, fooStore } = this.deps;

    // (a) optional session-guard assertions — skipped when session is absent
    if (session !== undefined) {
      assertAuthenticated(session);
      if (expectedTenantId !== undefined) {
        assertSessionInTenant(session, expectedTenantId);
      }
    }

    // (b) AuthZ — fail closed, before any side effect
    const allowed = await gate.can(userId, 'do-something', docId); // TODO: action verb
    if (!allowed) throw permissionDenied(userId, 'do-something', docId);

    // (c) build domain entity (validates invariants)
    const doc = createFoo({
      id: docId,
      text,
      ...(metadata !== undefined && { metadata }),
    });

    // (d) delegate side effects to ports; throw typed errors on contract breach
    if (text.trim().length === 0) {
      throw new ValidationError({ message: 'text required', details: { field: 'text' } });
    }
    // TODO: example contract check
    // if (vectors.length !== n) throw new InternalError({ message: '...', details: {...} });

    await fooStore.save(doc);
    return { docId: doc.id };
  }
}
