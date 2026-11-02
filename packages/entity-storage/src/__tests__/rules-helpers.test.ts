// SPDX-License-Identifier: Apache-2.0
/**
 * Orchestra helper-algebra tests — the `get`/`getAfter`/`now`/`claims`
 * eval extensions plus the observer/role predicate ports. Migrated to
 * standalone pnpm tsc to dodge the baseline dist/ tsc fail.
 */
import { describe, expect, it } from "vitest";
import { Session } from "@gertsai/session";
import type { AbstractDialog } from "@gertsai/session";
import {
  assertPendingWrites,
  WriteRuleDenied,
} from "../write-rules";
import type { TableWriteRules, WriteRuleEval } from "../write-rules";
import {
  callerHasRole,
  callerHasRoleIn,
  callerIsObserver,
  hasGuestRole,
  hasPrivilegedRole,
  hasRole,
  hasRoleWithSource,
  isAdmin,
  isObserver,
  notExpired,
} from "../rules-helpers";

const makeSession = (): Session =>
  new Session({
    operatorUuid: "op-1",
    operatorType: "web",
    tokenGetter: async () => "tok",
    dialog: {
      confirm: async () => false,
      alert: () => undefined,
      error: () => undefined,
    } as AbstractDialog,
    clientPlatform: "web",
    clientVersion: "1.0.0",
  });

const observersDoc = {
  observers: {
    "op-1": { roles: ["member"], sources: ["owner"] },
    "op-2": { roles: ["visitor"], sources: ["invite"] },
  },
  members: ["op-1"],
  visitors: ["op-2"],
  observers_uuid: ["op-1", "op-2", "op-3"],
};

describe("observer/role doc helpers — firestore.rules parity", () => {
  it("hasRole reads observers map roles", () => {
    expect(hasRole(observersDoc, "op-1", ["member"])).toBe(true);
    expect(hasRole(observersDoc, "op-1", ["editor"])).toBe(false);
  });

  it("hasRole falls back to denormalized array mirrors", () => {
    // op-9 absent from the map but present in the mirror column.
    const doc = { members: ["op-9"] };
    expect(hasRole(doc, "op-9", ["member"])).toBe(true);
    expect(hasRole(doc, "op-9", ["visitor"])).toBe(false);
  });

  it("isObserver = observers map key OR observers_uuid entry", () => {
    expect(isObserver(observersDoc, "op-1")).toBe(true);
    expect(isObserver(observersDoc, "op-3")).toBe(true); // uuid-mirror only
    expect(isObserver(observersDoc, "op-9")).toBe(false);
  });

  it("hasRoleWithSource requires role AND source", () => {
    expect(
      hasRoleWithSource(observersDoc, "op-1", ["member"], ["owner"]),
    ).toBe(true);
    expect(
      hasRoleWithSource(observersDoc, "op-1", ["member"], ["invite"]),
    ).toBe(false);
    expect(
      hasRoleWithSource(observersDoc, "op-2", ["visitor"], ["invite"]),
    ).toBe(true);
  });

  it("accepts scalar and array role/source arguments with the same authorization", () => {
    expect(hasRoleWithSource(observersDoc, "op-1", "member", "owner")).toBe(
      true,
    );
    expect(
      hasRoleWithSource(observersDoc, "op-1", ["member"], ["owner"]),
    ).toBe(true);
    expect(hasRoleWithSource(observersDoc, "op-1", "member", "invite")).toBe(
      false,
    );
    expect(
      hasRoleWithSource(observersDoc, "op-1", ["member"], ["invite"]),
    ).toBe(false);
  });

  it("privileged vs guest role sets", () => {
    expect(hasPrivilegedRole(observersDoc, "op-1")).toBe(true);
    expect(hasPrivilegedRole(observersDoc, "op-2")).toBe(false);
    expect(hasGuestRole(observersDoc, "op-2")).toBe(true);
    expect(hasGuestRole(observersDoc, "op-1")).toBe(false);
  });
});

describe("eval-level predicates", () => {
  const evalOn = (resource: Record<string, unknown>): WriteRuleEval => ({
    verb: "update",
    path: "chats",
    id: "c-1",
    session: makeSession(),
    affectedKeys: [],
    patch: {},
    resource,
  });

  it("callerHasRole / callerIsObserver read ctx.resource", async () => {
    expect(await callerHasRole(["member"])(evalOn(observersDoc))).toBe(true);
    expect(await callerHasRole(["editor"])(evalOn(observersDoc))).toBe(false);
    expect(await callerIsObserver(evalOn(observersDoc))).toBe(true);
  });

  it("callerHasRole on create inspects the patch (row absent)", async () => {
    const { resource: _dropped, ...rest } = evalOn(observersDoc);
    const ctx = {
      ...rest,
      verb: "create" as const,
      patch: observersDoc,
    };
    expect(await callerHasRole(["member"])(ctx)).toBe(true);
  });

  it("isAdmin reads claims.admin", async () => {
    expect(await isAdmin({ ...evalOn(observersDoc), claims: { admin: true } })).toBe(true);
    expect(await isAdmin(evalOn(observersDoc))).toBe(false);
  });

  it("notExpired compares the field against ctx.now", async () => {
    const ctx = {
      ...evalOn({ expire_at: "2030-01-01T00:00:00Z" }),
      now: new Date("2026-01-01T00:00:00Z"),
    };
    expect(await notExpired("expire_at")(ctx)).toBe(true);
    const past = { ...ctx, now: new Date("2031-01-01T00:00:00Z") };
    expect(await notExpired("expire_at")(past)).toBe(false);
  });
});

describe("assertPendingWrites — get/getAfter/now/claims wiring", () => {
  const session = makeSession();
  const db: Record<string, Record<string, unknown>> = {
    "chats/c-1": { id: "c-1", space_uid: "s-1", members: ["op-1"] },
    "chats/s-1": {
      id: "s-1",
      observers: { "op-1": { roles: ["member"], sources: [] } },
      members: ["op-1"],
    },
  };
  const read = async (path: string, id: string) => db[`${path}/${id}`];
  const gate = (rules: TableWriteRules) => ({
    session,
    rulesFor: () => rules,
    resource: read,
    now: new Date("2026-06-01T12:00:00Z"),
    claims: { admin: false },
  });

  it("ctx.get reads committed state of sibling docs", async () => {
    // isCrossOwner pattern: the member write is authorized by the
    // caller's role on the PARENT chat, fetched through ctx.get.
    const rules: TableWriteRules = {
      create: callerHasRoleIn(
        "chats",
        (ctx) => ctx.patch["space_uid"] as string | undefined,
        ["member"],
      ),
    };
    await assertPendingWrites(
      [
        {
          verb: "create",
          path: "space_members",
          id: "m-1",
          patch: { space_uid: "s-1", id: "m-1" },
        },
      ],
      gate(rules),
    );
    // A caller without the role is denied.
    await expect(
      assertPendingWrites(
        [
          {
            verb: "create",
            path: "space_members",
            id: "m-2",
            patch: { space_uid: "s-1", id: "m-2" },
          },
        ],
        {
          ...gate(rules),
          session: new Session({
            operatorUuid: "op-9",
            operatorType: "web",
            tokenGetter: async () => "tok",
            dialog: {
              confirm: async () => false,
              alert: () => undefined,
              error: () => undefined,
            } as AbstractDialog,
            clientPlatform: "web",
            clientVersion: "1.0.0",
          }),
        },
      ),
    ).rejects.toThrow(WriteRuleDenied);
  });

  it("ctx.getAfter sees the post-transaction state of sibling writes", async () => {
    // Rule: a member-join is allowed only when the invite it consumes
    // still has budget AFTER this batch — invite used_by folded with
    // the pending mark-consumed write.
    const invite = {
      id: "inv-1",
      max_uses: 2,
      used_by: ["u-1"],
    };
    db["invites/inv-1"] = invite;
    const rules: TableWriteRules = {
      create: async (ctx) => {
        const after = await ctx.getAfter?.("invites", "inv-1");
        return (
          after !== undefined &&
          (after["used_by"] as string[]).length <=
            (after["max_uses"] as number)
        );
      },
    };
    await assertPendingWrites(
      [
        {
          verb: "update",
          path: "invites",
          id: "inv-1",
          patch: { used_by: ["u-1", "op-1"] },
          action: { type: "redeem", params: {} },
        },
        {
          verb: "create",
          path: "space_members",
          id: "m-3",
          patch: { space_uid: "s-1", id: "m-3" },
        },
      ],
      {
        ...gate(rules),
        // invites table needs *some* ruleset so its update isn't skipped;
        // the redeem action just allows the used_by field.
        rulesFor: (path) =>
          path === "invites"
            ? { update: { redeem: () => true } }
            : rules,
      },
    );
  });


  it("ctx.now is the shared batch stamp; ctx.claims reach predicates", async () => {
    let seenNow: Date | undefined;
    let seenClaims: unknown;
    const rules: TableWriteRules = {
      create: (ctx) => {
        seenNow = ctx.now;
        seenClaims = ctx.claims;
        return true;
      },
    };
    const now = new Date("2026-06-02T00:00:00Z");
    await assertPendingWrites(
      [{ verb: "create", path: "space_members", id: "m-5", patch: { id: "m-5" } }],
      { session, rulesFor: () => rules, resource: read, now, claims: { admin: true } },
    );
    expect(seenNow).toBe(now);
    expect(seenClaims).toEqual({ admin: true });
  });
});
