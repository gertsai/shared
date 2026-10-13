// SPDX-License-Identifier: Apache-2.0
/**
 * Orchestra `firestore.rules` helper algebra — the doc-level and
 * eval-level predicates ported rules are built from.
 *
 * Two layers, matching how the original rules file is organized:
 *
 * - **Doc helpers** — pure functions over one entity row
 *   (`isObserver`, `hasRole`, `hasPrivilegedRole`, ...). These read the
 *   `observers` map plus its denormalized array mirrors
 *   (`members`/`editors`/`visitors`/`observers_uuid`), exactly like the
 *   Firestore-side originals: the map is the primary source, the arrays
 *   are the array-contains read path kept in lockstep by write rules.
 *
 * - **Predicate factories** — `WriteRulePredicate` builders for
 *   `defineTableRules`: `callerHasRole`, `callerHasRoleIn`,
 *   `callerIsObserver`, `isAdmin`, `notExpired`, ... Predicates are
 *   fail-closed on missing data — a rule that needs `ctx.get` and has no
 *   reader wired denies rather than guesses.
 */

import type { WriteRuleEval, WriteRulePredicate } from "./write-rules";

/** One stored entity row (`resource` / `get` result / create patch). */
export type EntityDoc = Readonly<Record<string, unknown>>;

/**
 * Observer roles the Orchestra model uses inside `observers[uid].roles`.
 * `PRIVILEGED_ROLES` is the write-capable set (their `hasPrivilegedRole`),
 * `GUEST_ROLES` the read-only set (their `hasGuestRole`). Exported so a
 * ruleset can widen/narrow them per collection without forking helpers.
 */
export const PRIVILEGED_ROLES = ["owner", "member", "editor"] as const;
export const GUEST_ROLES = ["visitor", "observer", "guest"] as const;

/**
 * Role → denormalized array column that mirrors it on the document.
 * `observers_uuid` is deliberately absent — it mirrors EVERY observer
 * (any presence incl. members/visitors), not an `observer` role; reading
 * it here would grant guest rights to every privileged member.
 */
const ROLE_ARRAY: Readonly<Record<string, string>> = {
  member: "members",
  editor: "editors",
  visitor: "visitors",
};

function asStringArray(v: unknown): readonly string[] {
  return Array.isArray(v) ? (v as readonly string[]) : [];
}

/**
 * The `observers[uid]` record — `{roles, sources}` in the current model.
 * Legacy docs may carry a bare `true`/number; normalize to empty lists
 * (presence alone still proves observer-ship).
 */
function observerRecord(
  doc: EntityDoc,
  uid: string,
): { roles: readonly string[]; sources: readonly string[] } | undefined {
  const observers = doc["observers"];
  if (typeof observers !== "object" || observers === null) return undefined;
  const rec = (observers as Record<string, unknown>)[uid];
  if (rec === undefined) return undefined;
  if (typeof rec !== "object" || rec === null) return { roles: [], sources: [] };
  const r = rec as Record<string, unknown>;
  return {
    roles: asStringArray(r["roles"]),
    sources: asStringArray(r["sources"]),
  };
}

/** `roles` list for `uid` on `doc` — `observers[uid].roles`. */
export function rolesOf(doc: EntityDoc, uid: string): readonly string[] {
  return observerRecord(doc, uid)?.roles ?? [];
}

/** `sources` list for `uid` — `observers[uid].sources` (owner/invite/...). */
export function sourcesOf(doc: EntityDoc, uid: string): readonly string[] {
  return observerRecord(doc, uid)?.sources ?? [];
}

/**
 * `isObserver` — `uid` appears in the observers map or the
 * `observers_uuid` mirror. Observer-ship is presence; it grants no role
 * by itself.
 */
export function isObserver(doc: EntityDoc, uid: string): boolean {
  if (asStringArray(doc["observers_uuid"]).includes(uid)) return true;
  return observerRecord(doc, uid) !== undefined;
}

/**
 * `hasRole` — `uid` holds ANY of `roles` on `doc`. Reads the observers
 * map first, then falls back to the denormalized array mirrors
 * (`members`/`editors`/`visitors`/`observers_uuid`) so rules work on
 * documents that carry only the mirror columns.
 */
export function hasRole(
  doc: EntityDoc,
  uid: string,
  roles: readonly string[],
): boolean {
  const held = rolesOf(doc, uid);
  if (roles.some((r) => held.includes(r))) return true;
  return roles.some((role) => {
    const arr = ROLE_ARRAY[role];
    return arr !== undefined && asStringArray(doc[arr]).includes(uid);
  });
}

/**
 * `hasRoleWithSource` — `uid` holds one of `roles` AND at least one of
 * `sources` on the same observer record.
 */
export function hasRoleWithSource(
  doc: EntityDoc,
  uid: string,
  roles: readonly string[],
  sources: readonly string[],
): boolean {
  const rec = observerRecord(doc, uid);
  if (rec === undefined) return false;
  return (
    roles.some((r) => rec.roles.includes(r)) &&
    sources.some((s) => rec.sources.includes(s))
  );
}

/** `hasPrivilegedRole` — owner/member/editor on `doc`. */
export function hasPrivilegedRole(doc: EntityDoc, uid: string): boolean {
  return hasRole(doc, uid, PRIVILEGED_ROLES);
}

/** `hasGuestRole` — visitor/observer/guest (read-only) on `doc`. */
export function hasGuestRole(doc: EntityDoc, uid: string): boolean {
  return hasRole(doc, uid, GUEST_ROLES);
}

/** The document a predicate should inspect — `resource` normally,
 *  falling back to `patch` on `create` (the row doesn't exist yet). */
function docUnderEval(ctx: WriteRuleEval): EntityDoc | undefined {
  if (ctx.resource !== undefined) return ctx.resource;
  return ctx.verb === "create" ? ctx.patch : undefined;
}

/** Authenticated-call floor — `request.auth != null`. */
export const isSignedIn: WriteRulePredicate = (ctx) =>
  ctx.session.operatorUuid !== "";

/** `request.auth.token.admin == true` port. */
export const isAdmin: WriteRulePredicate = (ctx) =>
  ctx.claims?.["admin"] === true;

/**
 * Caller holds any of `roles` on the document being written — the
 * `hasRole(resource, request.auth.uid, [...])` body of most Orchestra
 * update rules.
 */
export function callerHasRole(roles: readonly string[]): WriteRulePredicate {
  return (ctx) => {
    const doc = docUnderEval(ctx);
    return doc !== undefined && hasRole(doc, ctx.session.operatorUuid, roles);
  };
}

/** `isObserver(resource)` — caller appears on the document's observer set. */
export const callerIsObserver: WriteRulePredicate = (ctx) => {
  const doc = docUnderEval(ctx);
  return doc !== undefined && isObserver(doc, ctx.session.operatorUuid);
};

/**
 * Cross-document `hasRole` — the `isCrossOwner`/`isCrossEditor` pattern
 * (`hasRole(getChat(space_uid), uid, [...])`). `idOf` derives the target
 * id from the eval (usually `ctx.resource.space_uid` / `ctx.patch.*`).
 * Reads COMMITTED state through `ctx.get`; denies when no reader is wired.
 */
export function callerHasRoleIn(
  path: string,
  idOf: (ctx: WriteRuleEval) => string | undefined,
  roles: readonly string[],
): WriteRulePredicate {
  return async (ctx) => {
    if (ctx.get === undefined) return false;
    const id = idOf(ctx);
    if (id === undefined || id === "") return false;
    const doc = await ctx.get(path, id);
    return doc !== undefined && hasRole(doc, ctx.session.operatorUuid, roles);
  };
}

/**
 * Post-transaction variant — same read through `ctx.getAfter` for rules
 * that assert the caller's role as it will exist once the batch lands.
 */
export function callerHasRoleAfter(
  path: string,
  idOf: (ctx: WriteRuleEval) => string | undefined,
  roles: readonly string[],
): WriteRulePredicate {
  return async (ctx) => {
    if (ctx.getAfter === undefined) return false;
    const id = idOf(ctx);
    if (id === undefined || id === "") return false;
    const doc = await ctx.getAfter(path, id);
    return doc !== undefined && hasRole(doc, ctx.session.operatorUuid, roles);
  };
}

/**
 * Expiry gate — `field` on the document must be a timestamp in the
 * future (`invites.expire_at > request.time`). Accepts ISO strings,
 * `Date`, `{seconds}`-shaped stamps and epoch millis.
 */
export function notExpired(field: string): WriteRulePredicate {
  return (ctx) => {
    const doc = docUnderEval(ctx);
    const raw = doc?.[field];
    const expiry = toMillis(raw);
    const now = ctx.now?.getTime() ?? Date.now();
    return expiry !== undefined && expiry > now;
  };
}

/** Coerce the timestamp representations both stacks carry to millis. */
function toMillis(v: unknown): number | undefined {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? undefined : ms;
  }
  if (typeof v === "object" && v !== null) {
    const s = (v as Record<string, unknown>)["seconds"];
    if (typeof s === "number") return s * 1000;
  }
  return undefined;
}
