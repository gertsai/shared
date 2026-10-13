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
 * The `observers[uid]` record. Two shapes exist in Orchestra data:
 * current docs carry `roles` as a MAP — `{member: {sources: {...}},
 * editor: {sources: {...}}}` — where each role's `sources` is itself a
 * map (or array) of provenance ids; older/leaner docs carry
 * `roles: string[]`. A bare `true`/number means "observer, no roles".
 * Normalized to flat string lists; `sources` unions per-role sources
 * with any top-level `sources` list.
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
  const rolesRaw = r["roles"];
  const roles: string[] = [];
  const sources = [...asStringArray(r["sources"])];
  if (Array.isArray(rolesRaw)) {
    roles.push(...asStringArray(rolesRaw));
  } else if (typeof rolesRaw === "object" && rolesRaw !== null) {
    for (const [role, entry] of Object.entries(
      rolesRaw as Record<string, unknown>,
    )) {
      roles.push(role);
      if (typeof entry === "object" && entry !== null) {
        const s = (entry as Record<string, unknown>)["sources"];
        sources.push(
          ...(typeof s === "object" && s !== null && !Array.isArray(s)
            ? Object.keys(s as Record<string, unknown>)
            : asStringArray(s)),
        );
      }
    }
  }
  return { roles, sources: [...new Set(sources)] };
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
 * `hasRoleWithSource` — exact port of the rules helper: `uid` holds
 * `role` AND `role`'s per-role `sources` contain `source`
 * (`source_uid in docData.observers[uuid].roles[role].sources`).
 */
export function hasRoleWithSource(
  doc: EntityDoc,
  uid: string,
  roles: string | readonly string[],
  sources: string | readonly string[],
): boolean {
  const wantRoles = asStringArray(roles);
  const wantSources = asStringArray(sources);
  const observers = doc["observers"];
  if (typeof observers !== "object" || observers === null) return false;
  const rec = (observers as Record<string, unknown>)[uid];
  if (typeof rec !== "object" || rec === null) return false;
  const rolesRaw = (rec as Record<string, unknown>)["roles"];
  const hit = (role: string): unknown | undefined => {
    if (typeof rolesRaw === "object" && rolesRaw !== null && !Array.isArray(rolesRaw)) {
      const entry = (rolesRaw as Record<string, unknown>)[role];
      if (entry === undefined) return undefined;
      return typeof entry === "object" && entry !== null
        ? (entry as Record<string, unknown>)["sources"]
        : undefined;
    }
    return asStringArray(rolesRaw).includes(role)
      ? (rec as Record<string, unknown>)["sources"]
      : undefined;
  };
  for (const role of wantRoles) {
    const src = hit(role);
    if (src === undefined) continue;
    const has =
      typeof src === "object" && src !== null && !Array.isArray(src)
        ? wantSources.some((s) => s in (src as Record<string, unknown>))
        : wantSources.some((s) => asStringArray(src).includes(s));
    if (has) return true;
  }
  return false;
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

// ─── Combinators + identity fragments ────────────────────────────────────────

/** OR over predicates — the `||` chain in every Orchestra check body. */
export function anyOf(...preds: readonly WriteRulePredicate[]): WriteRulePredicate {
  return async (ctx) => {
    for (const p of preds) if (await p(ctx)) return true;
    return false;
  };
}

/** AND over predicates. */
export function allOf(...preds: readonly WriteRulePredicate[]): WriteRulePredicate {
  return async (ctx) => {
    for (const p of preds) if (!(await p(ctx))) return false;
    return true;
  };
}

/** Negation — `member_uuid != currUuid`-style clauses. */
export function not(pred: WriteRulePredicate): WriteRulePredicate {
  return async (ctx) => !(await pred(ctx));
}

/** Path-param self check — `user_uid == currUuid` (`Users/{user_uid}`). */
export const isSelfDoc: WriteRulePredicate = (ctx) =>
  ctx.id === ctx.session.operatorUuid;

/** `resData.<field> == currUuid` — caller named on the STORED row. */
export function resourceFieldIsCaller(field: string): WriteRulePredicate {
  return (ctx) => ctx.resource?.[field] === ctx.session.operatorUuid;
}

/** `reqResData.<field> == currUuid` — caller named on the INCOMING doc. */
export function patchFieldIsCaller(field: string): WriteRulePredicate {
  return (ctx) =>
    (ctx.verb === "create" ? ctx.patch[field] : ctx.patch[field]) ===
    ctx.session.operatorUuid;
}

/** `params.<field> == currUuid` — the write targets the caller. */
export function paramIsCaller(field: string): WriteRulePredicate {
  return (ctx) => ctx.action?.params[field] === ctx.session.operatorUuid;
}

/** `resData.<field> == value` — e.g. `type == 'channel'`. */
export function docFieldEq(field: string, value: unknown): WriteRulePredicate {
  return (ctx) => docUnderEval(ctx)?.[field] === value;
}

/** `isNotDeleted(doc)` — the doc's status is not 'deleted'. Type-guard:
 *  a live doc is a defined doc, so callers get narrowing for free. */
export const docIsLive = (doc: EntityDoc | undefined): doc is EntityDoc =>
  doc !== undefined && doc["status"] !== "deleted";

/** `isObserver(chat, uid)` on a doc fetched through `ctx.get` — the
 *  cross-doc observer probe (`isObserver(chat)` in message rules). */
export function callerIsObserverIn(
  path: string,
  idOf: (ctx: WriteRuleEval) => string | undefined,
): WriteRulePredicate {
  return async (ctx) => {
    if (ctx.get === undefined) return false;
    const id = idOf(ctx);
    if (id === undefined || id === "") return false;
    const doc = await ctx.get(path, id);
    return doc !== undefined && isObserver(doc, ctx.session.operatorUuid);
  };
}

// ─── Cross-role traversal — isCrossOwner / isCrossEditor / hasPrivilegedRole ─
//
// Their helpers walk the ancestry chain: the doc's own `cross_*` roles,
// then the space chat, then the project chat. The space id doubles as the
// workspace chat id (the Workspaces/Chats twin), so every ancestor read is
// `get('chats', uid)` regardless of which side named it.

/** `getChat(x)` — an id read on the universal entity table. */
async function getChat(
  ctx: WriteRuleEval,
  id: unknown,
): Promise<EntityDoc | undefined> {
  if (ctx.get === undefined || typeof id !== "string" || id === "")
    return undefined;
  return ctx.get("chats", id);
}

/** `isOwnerOrEditorOrCrossMemberSimplified(doc)` — owner_uuid match,
 *  editors[] entry, or cross_owner/cross_editor in the observers map. */
function isOwnerOrEditorOrCrossMember(doc: EntityDoc, uid: string): boolean {
  return (
    doc["owner_uuid"] === uid ||
    asStringArray(doc["editors"]).includes(uid) ||
    hasRole(doc, uid, ["cross_owner"]) ||
    hasRole(doc, uid, ["cross_editor"])
  );
}

/**
 * `isCrossOwner(data, uuid)` — `cross_owner` role on the doc, `owner` on
 * the space chat, or `owner`/`cross_owner` on the project chat.
 */
export const callerIsCrossOwner: WriteRulePredicate = async (ctx) => {
  const doc = docUnderEval(ctx);
  if (doc === undefined) return false;
  const uid = ctx.session.operatorUuid;
  if (hasRole(doc, uid, ["cross_owner"])) return true;
  const space = await getChat(ctx, doc["space_uid"]);
  if (space !== undefined && hasRole(space, uid, ["owner"])) return true;
  const project = await getChat(ctx, doc["project_uid"]);
  return (
    project !== undefined && hasRole(project, uid, ["owner", "cross_owner"])
  );
};

/**
 * `isCrossEditor(data, uuid)` — `cross_editor` on the doc's observers,
 * `editor` on the space's observers, `editor`/`cross_editor` on the
 * project's observers.
 */
export const callerIsCrossEditor: WriteRulePredicate = async (ctx) => {
  const doc = docUnderEval(ctx);
  if (doc === undefined) return false;
  const uid = ctx.session.operatorUuid;
  if (hasRole(doc, uid, ["cross_editor"])) return true;
  const space = await getChat(ctx, doc["space_uid"]);
  if (space !== undefined && hasRole(space, uid, ["editor"])) return true;
  const project = await getChat(ctx, doc["project_uid"]);
  return (
    project !== undefined && hasRole(project, uid, ["editor", "cross_editor"])
  );
};

/**
 * `hasPrivilegedRole(docData, uuid)` — owner/editors/cross-member on the
 * doc, the project chat, or the space chat (in that order).
 */
export const callerIsPrivileged: WriteRulePredicate = async (ctx) => {
  const doc = docUnderEval(ctx);
  if (doc === undefined) return false;
  const uid = ctx.session.operatorUuid;
  if (isOwnerOrEditorOrCrossMember(doc, uid)) return true;
  const project = await getChat(ctx, doc["project_uid"]);
  if (project !== undefined && isOwnerOrEditorOrCrossMember(project, uid))
    return true;
  const space = await getChat(ctx, doc["space_uid"]);
  return space !== undefined && isOwnerOrEditorOrCrossMember(space, uid);
};

/**
 * `hasGuestRole(data, uuid)` — `visitor` on the SPACE chat: theirs reads
 * `getChat(space_uid ?? _uid)` — the visitor role lives on the workspace,
 * never on the entity itself.
 */
export const callerIsGuest: WriteRulePredicate = async (ctx) => {
  const doc = docUnderEval(ctx);
  if (doc === undefined) return false;
  const spaceId =
    typeof doc["space_uid"] === "string" && doc["space_uid"] !== ""
      ? doc["space_uid"]
      : doc["id"] ?? doc["_uid"];
  const space = await getChat(ctx, spaceId);
  return space !== undefined && hasRole(space, ctx.session.operatorUuid, ["visitor"]);
};

/**
 * `ifChatMessagesAccessible(chat, uid)` — message-level read/write gate.
 * `chatOf` fetches the parent chat (usually
 * `ctx.get('chats', ctx.resource.chat_uid)`). Clauses ported:
 * member || (observer && !visitor) || (non-group/personal && cross).
 * The channel-public and shared-space branches of the original need
 * workspace/shared_docs lookups — covered by callerHasRoleIn at the
 * call site until the shared-spaces feature lands.
 */
export function chatMessagesAccessible(
  chatOf: (ctx: WriteRuleEval) => Promise<EntityDoc | undefined>,
): WriteRulePredicate {
  return async (ctx) => {
    const uid = ctx.session.operatorUuid;
    const chat = await chatOf(ctx);
    if (!docIsLive(chat)) return false;
    if (hasRole(chat, uid, ["member"])) return true;
    if (isObserver(chat, uid) && !hasRole(chat, uid, ["visitor"])) return true;
    const t = chat["type"];
    if (t !== "group" && t !== "personal") {
      // cross roles evaluated against the CHAT doc as context.
      const asDoc: WriteRuleEval = { ...ctx, resource: chat };
      if (await callerIsCrossOwner(asDoc)) return true;
      if (await callerIsCrossEditor(asDoc)) return true;
    }
    return false;
  };
}
