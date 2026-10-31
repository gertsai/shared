// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

import { Session } from "@gertsai/session";
import type { AbstractDialog } from "@gertsai/session";

import {
  allowFields,
  allowWrite,
  assertPendingWrites,
  assertWriteAllowed,
  collectTableRules,
  computeAffectedKeys,
  defineTableRules,
  denyWrite,
  WriteRuleDenied,
} from "../write-rules";
import type { TableWriteRules, WriteRuleEval } from "../write-rules";

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

const baseEval = (overrides: Partial<WriteRuleEval> = {}): WriteRuleEval => ({
  verb: "update",
  path: "cards",
  id: "c-1",
  session: makeSession(),
  affectedKeys: [],
  patch: {},
  ...overrides,
});

describe("computeAffectedKeys — Orchestra affectedKeys() parity", () => {
  it("every patch key counts when resource is missing", () => {
    expect(computeAffectedKeys({ a: 1, b: 2 }, undefined)).toEqual(["a", "b"]);
  });

  it('identical values do not count (no-op writes are not "affected")', () => {
    const resource = { title: "x", position: 5, meta: { deep: [1, 2] } };
    expect(
      computeAffectedKeys(
        { title: "x", position: 9, meta: { deep: [1, 2] } },
        resource,
      ),
    ).toEqual(["position"]);
  });

  it("type changes and null transitions count", () => {
    const resource = { a: null, b: "1" };
    expect(computeAffectedKeys({ a: "x", b: "1" }, resource)).toEqual(["a"]);
  });

  it("compares dotted patch keys as literal persisted keys", () => {
    const resource = {
      settings: { theme: "dark" },
      "settings.theme": "light",
    };
    expect(
      computeAffectedKeys(
        { "settings.theme": "dark", settings: { theme: "dark" } },
        resource,
      ),
    ).toEqual(["settings.theme"]);
    expect(
      computeAffectedKeys({ "settings.theme": "light" }, resource),
    ).toEqual([]);
  });
});

describe("allowFields — verifyUpdateObject parity", () => {
  it("requires every required key and forbids foreign keys", () => {
    const p = allowFields(["list_id", "position"], ["assignee_id"]);
    expect(
      p(
        baseEval({
          affectedKeys: ["list_id", "position", "assignee_id"],
        }),
      ),
    ).toBe(true);
    expect(p(baseEval({ affectedKeys: ["list_id"] }))).toBe(false); // missing required
    expect(
      p(baseEval({ affectedKeys: ["list_id", "position", "title"] })),
    ).toBe(false); // foreign key
  });
});

describe("assertWriteAllowed — fail-closed semantics", () => {
  it("undefined ruleset → table opted out, write passes", async () => {
    await assertWriteAllowed(undefined, baseEval());
  });

  it("ruleset without a matching verb → denied", async () => {
    const rules: TableWriteRules = { create: allowWrite };
    await expect(assertWriteAllowed(rules, baseEval())).rejects.toThrow(
      WriteRuleDenied,
    );
    await expect(assertWriteAllowed(rules, baseEval())).rejects.toThrow(
      /no rule for verb 'update'/,
    );
  });

  it("update without update_action → NO_UPDATE_ACTION", async () => {
    const rules: TableWriteRules = { update: allowWrite };
    await expect(assertWriteAllowed(rules, baseEval())).rejects.toThrow(
      /NO_UPDATE_ACTION/,
    );
  });

  it("unknown action type with no `*` fallback → denied", async () => {
    const rules: TableWriteRules = {
      update: { card_updated: allowFields(["title"]) },
    };
    const eval_ = baseEval({
      action: { type: "card_moved", params: {} },
      affectedKeys: ["title"],
      patch: { title: "t" },
    });
    await expect(assertWriteAllowed(rules, eval_)).rejects.toThrow(
      /action 'card_moved'/,
    );
  });

  it("`*` fallback catches unlisted action types", async () => {
    const rules: TableWriteRules = { update: { "*": allowWrite } };
    await assertWriteAllowed(
      rules,
      baseEval({ action: { type: "anything", params: {} } }),
    );
  });

  it("caller-supplied audit fields in patch → denied before predicate", async () => {
    const rules: TableWriteRules = {
      create: vi.fn(() => true),
      update: { "*": vi.fn(() => true) },
    };
    const createEval = baseEval({
      verb: "create",
      affectedKeys: ["title", "creator_uuid"],
      patch: { title: "t", creator_uuid: "spoof" },
    });
    await expect(assertWriteAllowed(rules, createEval)).rejects.toThrow(
      /protected fields in diff: creator_uuid/,
    );
    // `status` is deliberately NOT protected on update — Orchestra writes
    // it through action types (archive/delete/restore); per-action
    // allowlists regulate it. Audit fields stay protected.
    const updateEval = baseEval({
      action: { type: "card_updated", params: {} },
      affectedKeys: ["update_version"],
      patch: { update_version: 99 },
    });
    await expect(assertWriteAllowed(rules, updateEval)).rejects.toThrow(
      /protected fields in diff: update_version/,
    );
    expect(rules.create).not.toHaveBeenCalled();
  });

  it("does not interpret a dotted literal key as a protected root field", async () => {
    const predicate = vi.fn(() => true);
    const rules: TableWriteRules = { update: { "*": predicate } };
    await assertWriteAllowed(
      rules,
      baseEval({
        action: { type: "card_updated", params: {} },
        affectedKeys: ["entity_status.archived"],
        patch: { "entity_status.archived": true },
      }),
    );
    expect(predicate).toHaveBeenCalledTimes(1);
  });

  it("predicate returning false → denied with reason", async () => {
    const rules: TableWriteRules = { create: denyWrite };
    await expect(
      assertWriteAllowed(
        rules,
        baseEval({ verb: "create", affectedKeys: ["x"], patch: { x: 1 } }),
      ),
    ).rejects.toThrow(/rule predicate returned false/);
  });

  it("async predicates are awaited", async () => {
    const rules: TableWriteRules = {
      delete: async () => true,
    };
    await assertWriteAllowed(
      rules,
      baseEval({
        verb: "delete",
        action: { type: "delete", params: {} },
      }),
    );
  });

  it("delete/restore/destroy route to their own predicates", async () => {
    const rules: TableWriteRules = {
      delete: { delete: allowWrite },
      restore: allowWrite,
      destroy: denyWrite,
    };
    await assertWriteAllowed(
      rules,
      baseEval({ verb: "delete", action: { type: "delete", params: {} } }),
    );
    await assertWriteAllowed(rules, baseEval({ verb: "restore" }));
    await expect(
      assertWriteAllowed(rules, baseEval({ verb: "destroy" })),
    ).rejects.toThrow(WriteRuleDenied);
  });
});

describe("collectTableRules / defineTableRules", () => {
  it("merges defs and rejects duplicate paths", () => {
    const a = defineTableRules("cards", { create: allowWrite });
    const b = defineTableRules("boards", { update: allowWrite });
    const rules = collectTableRules(a, b);
    expect(Object.keys(rules).sort()).toEqual(["boards", "cards"]);
    expect(() => collectTableRules(a, a)).toThrow(/Duplicate write-rules/);
  });
});

describe("WriteRuleDenied — diagnostics payload", () => {
  it("carries path/id/verb/actionType/reason for log scanners", async () => {
    const rules: TableWriteRules = { update: { "*": denyWrite } };
    const err = await assertWriteAllowed(
      rules,
      baseEval({
        action: { type: "card_updated", params: {} },
        patch: { title: "x" },
        affectedKeys: ["title"],
      }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteRuleDenied);
    const denied = err as WriteRuleDenied;
    expect(denied.path).toBe("cards");
    expect(denied.id).toBe("c-1");
    expect(denied.verb).toBe("update");
    expect(denied.actionType).toBe("card_updated");
    expect(denied.reason).toBe(
      "rule predicate returned false (affected: title)",
    );
  });
});

describe("assertPendingWrites — parallel resource prefetch", () => {
  const UPD_RULES: TableWriteRules = {
    update: { card_updated: allowWrite },
    delete: allowWrite,
  };
  const act = { type: "card_updated", params: {} };

  it("dedupes reads by (path,id) and issues them concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];
    const resource = vi.fn(
      async (path: string, id: string): Promise<Record<string, unknown>> => {
        calls.push(`${path}/${id}`);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yield so a serialized reader would never reach inFlight=2.
        await new Promise((r) => setImmediate(r));
        inFlight -= 1;
        return { _uid: id, title: "row" };
      },
    );
    await assertPendingWrites(
      [
        {
          verb: "update",
          path: "cards",
          id: "c-1",
          patch: { title: "a" },
          action: act,
        },
        {
          verb: "update",
          path: "cards",
          id: "c-1",
          patch: { title: "b" },
          action: act,
        },
        {
          verb: "update",
          path: "cards",
          id: "c-2",
          patch: { title: "c" },
          action: act,
        },
      ],
      { session: makeSession(), rulesFor: () => UPD_RULES, resource },
    );
    expect(calls).toEqual(["cards/c-1", "cards/c-2"]);
    expect(resource).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(2);
  });

  it("keeps eval order — the first failing write denies regardless of read order", async () => {
    const resource = vi.fn(async () => ({ title: "row" }));
    const rules: TableWriteRules = {
      update: { card_updated: allowWrite, denied_act: denyWrite },
    };
    await expect(
      assertPendingWrites(
        [
          {
            verb: "update",
            path: "cards",
            id: "c-1",
            patch: { t: 1 },
            action: { type: "denied_act", params: {} },
          },
          {
            verb: "update",
            path: "cards",
            id: "c-2",
            patch: { t: 2 },
            action: act,
          },
        ],
        { session: makeSession(), rulesFor: () => rules, resource },
      ),
    ).rejects.toThrow(WriteRuleDenied);
  });

  it("does not read resources for ungoverned paths, and deny-mode still fires", async () => {
    const resource = vi.fn(async () => ({ title: "row" }));
    await expect(
      assertPendingWrites(
        [{ verb: "update", path: "foreign", id: "x", patch: {}, action: act }],
        {
          session: makeSession(),
          rulesFor: () => undefined,
          unmappedPath: "deny",
          resource,
        },
      ),
    ).rejects.toThrow(/no ruleset registered/);
    expect(resource).not.toHaveBeenCalled();
  });
});

describe("assertPendingWrites — concurrent cross-document reads", () => {
  it("memoizes in-flight reads and separates path/id boundary collisions", async () => {
    const calls: string[] = [];
    const resource = async (path: string, id: string) => {
      calls.push(JSON.stringify([path, id]));
      return { key: JSON.stringify([path, id]) };
    };
    const rules: TableWriteRules = {
      update: {
        changed: async (ctx) => {
          const [sameA, sameB, left, right] = await Promise.all([
            ctx.get?.("a b", "c"),
            ctx.get?.("a b", "c"),
            ctx.get?.("a", "b c"),
            ctx.get?.("a b", "c"),
          ]);
          return (
            sameA === sameB &&
            sameB === right &&
            left?.["key"] === JSON.stringify(["a", "b c"]) &&
            right?.["key"] === JSON.stringify(["a b", "c"])
          );
        },
      },
    };
    await assertPendingWrites(
      [
        {
          verb: "update",
          path: "cards",
          id: "c-1",
          patch: {},
          action: { type: "changed", params: {} },
        },
      ],
      { session: makeSession(), rulesFor: () => rules, resource },
    );
    expect(calls).toHaveLength(3);
    expect(new Set(calls).size).toBe(3);
  });
});
