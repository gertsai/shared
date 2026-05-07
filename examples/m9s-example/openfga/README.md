# OpenFGA — m9s-example ReBAC reference

> Sprint 3.11 wires real OpenFGA-backed authorization into m9s-example as a
> canonical ReBAC pattern for `@gertsai/*` consumers. This file documents the
> model shape, tuple lifecycle, and the cross-tenant DENY adversarial test.
> Architectural rationale lives in **ADR-011 §Decision B** (locked to **B2
> Tenant-hierarchy** via Amendment 1 ADI; reconciled with the canonical
> `@gertsai/auth-openfga.FgaResourceType` taxonomy in Amendment 2 §A2.1-A2.4).

## What is OpenFGA / ReBAC?

[OpenFGA](https://openfga.dev) is a high-performance authorization server that
implements **ReBAC** (Relationship-Based Access Control), the model behind
Google Zanzibar. Where **RBAC** asks _"does user U have role R?"_ and **ABAC**
asks _"do U's attributes satisfy policy P?"_, **ReBAC** asks _"is there a path
from U to resource X through some chain of relations?"_ — checks reduce to
graph reachability, not table lookups.

For multi-tenant systems this matters because cross-tenant access (or its
absence) becomes a structural property of the tuple graph, not a runtime
predicate that can be forgotten in a SQL `WHERE` clause. The gate fails
**closed** (`return false`) on any error — network partition, missing tuple,
malformed identifier — per ADR-011 I-4 + Amendment 2 §A2.4.

> **Further reading**: [OpenFGA Concepts](https://openfga.dev/docs/concepts),
> [Modeling Guide](https://openfga.dev/docs/modeling/getting-started), and
> the original [Zanzibar paper](https://research.google/pubs/pub48190/).

## Tuple shape — 2-hop check resolution

m9s-example uses **B2 Tenant-hierarchy** (locked via Amendment 1 ADI). The
authorization model in [`model.fga`](./model.fga) declares three types and
two hops:

```
   user:U  ──member──▶  tenant:T  ◀──tenant──  document:D
                                  └────────► (derived) can_view, can_edit
```

When the gate evaluates `can user:alice can_view document:d1?`, OpenFGA:

1. Looks up tuples matching `(?, member, tenant:?)` → finds
   `(user:alice, member, tenant:tenant-acme)`.
2. Looks up tuples matching `(document:d1, tenant, tenant:?)` → finds
   `(document:d1, tenant, tenant:tenant-acme)` (written at ingest time).
3. Intersects on `tenant:tenant-acme` → `allowed=true`.

If either tuple is missing or names a different tenant, the intersection is
empty → `allowed=false`. **Cross-tenant access is structurally impossible**
without writing a tuple that bridges the tenants — and we never write one.

### What's stored where

| Tuple shape | Lifecycle | Source |
|---|---|---|
| `(user:U, member, tenant:T)` | seeded once at bootstrap; updated as users join/leave tenants | [`bootstrap-tuples.yaml`](./bootstrap-tuples.yaml) → `scripts/openfga-bootstrap.ts` |
| `(document:D, tenant, tenant:T)` | written **per-document at ingest time** as a post-INSERT side-effect | `pg-document.repository.ts` → `@gertsai/auth-openfga.writeTuples` |

> **No wildcard tuples.** The naive shape `(tenant:T, tenant, document:*)` is
> non-portable OpenFGA syntax (object-position wildcards mean the literal
> string `*`, not "any document"). Pre-Build live-spike W-3-11-8a confirmed
> per-document tuple writes are the only correct B2 implementation; see
> Amendment 2 §A2.3 for the full audit trail.

### Why `can_view` and `can_edit`, not `reader` and `writer`

`@gertsai/auth-openfga.FgaRelations` is a typed map fixed by the package
contract — relations are drawn from `FGA_RELATIONS` (`can_view`, `can_edit`,
`member`, `owner`, ...). Custom relation names like `reader` / `writer` would
fail type-checking at gate construction. The model.fga shape mirrors the
canonical taxonomy verbatim per Amendment 2 §A2.2.

## Adding a new tenant + user (post-bootstrap)

The bootstrap script seeds one tenant (`tenant-acme`) and one user
(`user:default`) — enough for the smoke flow. To extend:

### Option A — direct API (curl)

```bash
# Resolve the store id from .env (printed by openfga:bootstrap)
source .env

# 1. Add a new tenant — implicit; no tuple needed for the tenant itself.
#    Tenants are referenced by `(?, ?, tenant:<id>)` tuples; the type system
#    just registers `tenant:tenant-bravo` the first time it appears.

# 2. Add a user-tenant membership tuple
curl -s -X POST "${FGA_API_URL}/stores/${FGA_STORE_ID}/write" \
  -H "Authorization: Bearer ${FGA_API_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "writes": {
      "tuple_keys": [
        {"user": "user:bob", "relation": "member", "object": "tenant:tenant-bravo"}
      ]
    }
  }' | jq

# 3. Verify
curl -s -X POST "${FGA_API_URL}/stores/${FGA_STORE_ID}/check" \
  -H "Authorization: Bearer ${FGA_API_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "tuple_key": {"user": "user:bob", "relation": "member", "object": "tenant:tenant-bravo"}
  }' | jq
# → {"allowed":true}
```

### Option B — fixture script

Re-run the bootstrap script after editing
[`bootstrap-tuples.yaml`](./bootstrap-tuples.yaml):

```bash
# Append to bootstrap-tuples.yaml:
#   - user: user:bob
#     relation: member
#     object: tenant:tenant-bravo

pnpm --filter @gertsai-examples/m9s-example openfga:bootstrap
# Idempotent — existing tuples are not duplicated.
```

### Option C — `fga` CLI

If you have the [OpenFGA CLI](https://github.com/openfga/cli) installed:

```bash
fga --api-url "${FGA_API_URL}" --store-id "${FGA_STORE_ID}" --api-token "${FGA_API_TOKEN}" \
  tuple write user:bob member tenant:tenant-bravo
```

After adding the membership tuple, ingesting a document under
`tenant-bravo` automatically writes the per-document tuple
`(document:<doc-uuid>, tenant, tenant:tenant-bravo)` from
`pg-document.repository.ts`. No extra step.

## Adversarial test — cross-tenant DENY at the gate

This is the same pattern verified by W-3-11-8a (pre-Build live-spike) and
codified in `tests/real-infra/openfga.test.ts`. It demonstrates that a member
of tenant-A **cannot** read a document belonging to tenant-B — with no
application-level check; OpenFGA itself returns `allowed=false`.

```bash
source .env

# Setup — write a document tuple under tenant-acme and a user under tenant-bravo
curl -s -X POST "${FGA_API_URL}/stores/${FGA_STORE_ID}/write" \
  -H "Authorization: Bearer ${FGA_API_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "writes": {
      "tuple_keys": [
        {"user": "user:carol", "relation": "member", "object": "tenant:tenant-bravo"},
        {"user": "tenant:tenant-acme", "relation": "tenant", "object": "document:d-acme-1"}
      ]
    }
  }' | jq

# Adversarial check: can carol@bravo view d-acme-1?
curl -s -X POST "${FGA_API_URL}/stores/${FGA_STORE_ID}/check" \
  -H "Authorization: Bearer ${FGA_API_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "tuple_key": {"user": "user:carol", "relation": "can_view", "object": "document:d-acme-1"}
  }' | jq
# → {"allowed":false}     ✅ cross-tenant DENY at the gate

# Sanity check: same call from a tenant-acme user
curl -s -X POST "${FGA_API_URL}/stores/${FGA_STORE_ID}/check" \
  -H "Authorization: Bearer ${FGA_API_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "tuple_key": {"user": "user:default", "relation": "can_view", "object": "document:d-acme-1"}
  }' | jq
# → {"allowed":true}      ✅ same-tenant ALLOW
```

The same flow runs as a Vitest assertion in
`tests/real-infra/openfga.test.ts` (env-gated by `OPENFGA_E2E=1`); see
SPEC-016 W-3-11-15.

## Defence in depth

OpenFGA is the **primary** authorization layer, but not the only one:

1. **OpenFGA gate** (this layer) — relationship check before any
   application logic runs. Fails closed on errors.
2. **`WHERE tenant_id = $1` SQL filter** (per ADR-011 I-13) — every
   `chunks` SQL issued by `pg-vector.store.ts` includes a mandatory tenant
   filter. Last line of defence if the OpenFGA gate is misconfigured.
3. **`AllowAllPermissionGate` production guard** (per ADR-011 I-12) — the
   mock gate's constructor throws `ConfigurationError` when
   `NODE_ENV='production'`. Production deploys with `AUTH_GATE=allow-all`
   cannot succeed.

If layer 1 ever silently fails open, layer 2 still constrains the blast
radius to the requestor's own tenant; layer 3 prevents the dev-mode mock
from being deployed into prod by accident.

## References

- [`model.fga`](./model.fga) — authorization model DSL (canonical
  FgaResourceType taxonomy, schema 1.1).
- [`bootstrap-tuples.yaml`](./bootstrap-tuples.yaml) — seeded tenant
  membership tuples (NO wildcards).
- `scripts/openfga-bootstrap.ts` — idempotent store + model + tuple
  bootstrapper.
- `src/infrastructure/openfga-permission.gate.ts` — the
  `IPermissionGate` adapter (E+ MODIFIED in Sprint 3.11; uses canonical
  `FgaResourceType` enum + `FGA_RELATIONS` constants).
- `tests/real-infra/openfga.test.ts` — env-gated adversarial suite
  (≥4 tests: same-tenant ALLOW, cross-tenant DENY, missing tuple DENY,
  unreachable DENY + I-12 production guard + p50 latency benchmark).
- `@gertsai/auth-openfga` — the underlying client + types
  (`FgaResourceType`, `FGA_RELATIONS`, `getFgaClient`, `checkPermission`,
  `writeTuples`).
- **ADR-011 §Decision B** — B2 Tenant-hierarchy locked via Amendment 1
  ADI; reconciled with package taxonomy in Amendment 2 §A2.1-A2.4.
- **ADR-011 Invariants** — I-4 (deny-by-default), I-12 (NODE_ENV
  production guard), I-13 (mandatory `WHERE tenant_id`), I-14 (gate
  stateless), I-16 (FGA_API_TOKEN preshared bearer).
- **EVID-019** — Sprint 3.11 evidence pack documenting live-spike
  W-3-11-8a + adversarial test verdicts.

## License

Apache-2.0. Same as the rest of `gertsai/shared`.
