// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import { Session } from "@gertsai/session";
import type { AbstractDialog } from "@gertsai/session";

import { assertPendingWrites } from "../write-rules";
import type { PendingWrite, TableWriteRules } from "../write-rules";

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

const initial = {
  id: "c-1",
  title: "before",
  status: "created",
  deleted_at: null,
  deleted_by_uuid: null,
  deleted_by_platform: null,
  update_version: 4,
  update_action: { type: "seed", params: {}, timestamp: "seed-time" },
};

async function postimage(write: PendingWrite) {
  let observed: Record<string, unknown> | undefined;
  const rules: TableWriteRules = {
    update: { changed: async (ctx) => {
      observed = await ctx.getAfter?.("cards", "c-1");
      return true;
    } },
    delete: { removed: async (ctx) => {
      observed = await ctx.getAfter?.("cards", "c-1");
      return true;
    } },
    restore: async (ctx) => {
      observed = await ctx.getAfter?.("cards", "c-1");
      return true;
    },
    destroy: async (ctx) => {
      observed = await ctx.getAfter?.("cards", "c-1");
      return true;
    },
  };
  await assertPendingWrites([write], {
    session: makeSession(),
    rulesFor: () => rules,
    resource: async () => initial,
  });
  return observed;
}

const baseWrite = (overrides: Partial<PendingWrite>): PendingWrite => ({
  verb: "update",
  path: "cards",
  id: "c-1",
  patch: {},
  ...overrides,
});

describe("getAfter persisted postimages", () => {
  it("observes the stamped soft-delete state without mutating committed data", async () => {
    const deletedAt = { seconds: 100, nanoseconds: 250 };
    const post = await postimage(
      baseWrite({
        verb: "delete",
        action: { type: "removed", params: {} },
        persistedData: {
          deleted_at: deletedAt,
          deleted_by_uuid: "op-1",
          deleted_by_platform: "web",
          status: "deleted",
          update_action: { type: "removed", params: {}, timestamp: deletedAt },
          update_version: 99,
        },
      }),
    );
    expect(post).toMatchObject({
      status: "deleted",
      deleted_at: deletedAt,
      deleted_by_uuid: "op-1",
      update_version: 5,
    });
    expect(initial).toMatchObject({ status: "created", update_version: 4 });
  });

  it("observes the exact service-stamped restore markers and next version", async () => {
    const restoredAt = { seconds: 200, nanoseconds: 500 };
    const post = await postimage(
      baseWrite({
        verb: "restore",
        persistedData: {
          deleted_at: null,
          deleted_by_uuid: null,
          deleted_by_platform: null,
          status: "created",
          update_action: { type: "restore", params: {}, timestamp: restoredAt },
          update_version: 1,
        },
      }),
    );
    expect(post).toMatchObject({
      status: "created",
      deleted_at: null,
      deleted_by_uuid: null,
      update_action: { timestamp: restoredAt },
      update_version: 5,
    });
  });

  it("folds delete then restore in order and advances each version", async () => {
    const deleteTime = { seconds: 300, nanoseconds: 0 };
    const restoreTime = { seconds: 400, nanoseconds: 0 };
    let observed: Record<string, unknown> | undefined;
    await assertPendingWrites(
      [
        baseWrite({
          verb: "delete",
          action: { type: "removed", params: {} },
          persistedData: {
            deleted_at: deleteTime,
            deleted_by_uuid: "op-1",
            deleted_by_platform: "web",
            status: "deleted",
            update_version: 99,
          },
        }),
        baseWrite({
          verb: "restore",
          persistedData: {
            deleted_at: null,
            deleted_by_uuid: null,
            deleted_by_platform: null,
            status: "created",
            update_action: { type: "restore", params: {}, timestamp: restoreTime },
            update_version: 1,
          },
        }),
      ],
      {
        session: makeSession(),
        rulesFor: () => ({
          delete: { removed: async (ctx) => {
            observed = await ctx.getAfter?.("cards", "c-1");
            return true;
          } },
          restore: async (ctx) => {
            observed = await ctx.getAfter?.("cards", "c-1");
            return true;
          },
        }),
        resource: async () => initial,
      },
    );
    expect(observed).toMatchObject({
      status: "created",
      deleted_at: null,
      update_action: { timestamp: restoreTime },
      update_version: 6,
    });
  });

  it("folds updates with their exact audit stamp and provider version", async () => {
    const updatedAt = { seconds: 500, nanoseconds: 750 };
    const post = await postimage(
      baseWrite({
        verb: "update",
        action: { type: "changed", params: {} },
        patch: { title: "after" },
        persistedData: {
          title: "after",
          updated_at: updatedAt,
          updated_by_uuid: "op-1",
          updated_by_platform: "web",
          update_action: { type: "changed", params: {}, timestamp: updatedAt },
          update_version: 500,
        },
      }),
    );
    expect(post).toMatchObject({
      title: "after",
      updated_at: updatedAt,
      update_action: { timestamp: updatedAt },
      update_version: 5,
    });
  });

  it("returns absence after physical destroy", async () => {
    await expect(
      postimage(baseWrite({ verb: "destroy" })),
    ).resolves.toBeUndefined();
  });
});
