/**
 * Unit tests for teams route validation and route handler logic.
 *
 * Tests createTeamSchema and updateTeamSchema (including .strict() and
 * storageQuota/retentionHours), duplicate detection, Default team protection,
 * and member count checks from apps/api/src/routes/teams.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertedValues: undefined as Record<string, unknown> | undefined,
  insertRowCount: 1,
  updatedValues: undefined as Record<string, unknown> | undefined,
  updateRowCount: 1,
  deleteWhere: vi.fn(() => Promise.resolve()),
  requirePermission: vi.fn(() => () => Promise.resolve({ id: "admin-1", role: "admin" })),
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    sql: strings.join("?"),
    vals,
  }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => {
  const nextRows = () => mocks.selectQueue.shift() ?? [];
  const dbObj = {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = nextRows();
          const p = Promise.resolve(rows);
          return Object.assign(p, {
            for: () => Promise.resolve(rows),
          });
        },
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        mocks.insertedValues = vals;
        return {
          onConflictDoNothing: () => Promise.resolve({ rowCount: mocks.insertRowCount }),
        };
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        mocks.updatedValues = vals;
        return {
          where: () => Promise.resolve({ rowCount: mocks.updateRowCount }),
        };
      },
    }),
    delete: () => ({
      where: mocks.deleteWhere,
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return {
    db: dbObj,
    pool: {},
    closeDb: async () => {},
    schema: {
      teams: {
        id: "teams.id",
        name: "teams.name",
        storageQuota: "teams.storage_quota",
        retentionHours: "teams.retention_hours",
        createdAt: "teams.created_at",
      },
      users: {
        team: "users.team",
      },
    },
  };
});

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: mocks.requirePermission,
}));

import {
  createTeamSchema,
  teamsRoutes,
  updateTeamSchema,
} from "../../../apps/api/src/routes/teams.js";

// ── Tests ───────────────────────────────────────────────────────────────

describe("teams route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue = [];
    mocks.insertedValues = undefined;
    mocks.insertRowCount = 1;
    mocks.updatedValues = undefined;
    mocks.updateRowCount = 1;
    mocks.requirePermission.mockImplementation(
      () => () => Promise.resolve({ id: "admin-1", role: "admin" }),
    );
  });

  describe("createTeamSchema validation", () => {
    it("accepts valid team name", () => {
      const result = createTeamSchema.safeParse({ name: "Engineering" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe("Engineering");
    });

    it("trims whitespace from team name", () => {
      const result = createTeamSchema.safeParse({ name: "  Design  " });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe("Design");
    });

    it("rejects empty string after trimming", () => {
      const result = createTeamSchema.safeParse({ name: "   " });
      expect(result.success).toBe(false);
    });

    it("rejects missing name field", () => {
      const result = createTeamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects name longer than 50 characters", () => {
      const result = createTeamSchema.safeParse({ name: "A".repeat(51) });
      expect(result.success).toBe(false);
    });

    it("accepts name exactly 50 characters", () => {
      const result = createTeamSchema.safeParse({ name: "A".repeat(50) });
      expect(result.success).toBe(true);
    });

    it("accepts single character name", () => {
      const result = createTeamSchema.safeParse({ name: "X" });
      expect(result.success).toBe(true);
    });

    it("rejects non-string name", () => {
      const result = createTeamSchema.safeParse({ name: 123 });
      expect(result.success).toBe(false);
    });

    it("accepts optional storageQuota and retentionHours and rejects unknown keys (.strict())", () => {
      const valid = createTeamSchema.safeParse({
        name: "Ops",
        storageQuota: 1024 * 1024,
        retentionHours: 24,
      });
      expect(valid.success).toBe(true);

      const nullable = createTeamSchema.safeParse({
        name: "Ops",
        storageQuota: null,
        retentionHours: null,
      });
      expect(nullable.success).toBe(true);

      const unknownKey = createTeamSchema.safeParse({
        name: "Ops",
        storagequota: 1024,
      });
      expect(unknownKey.success).toBe(false);

      expect(createTeamSchema.safeParse({ name: "Ops", storageQuota: 0 }).success).toBe(false);
      expect(createTeamSchema.safeParse({ name: "Ops", storageQuota: -1 }).success).toBe(false);
      expect(createTeamSchema.safeParse({ name: "Ops", storageQuota: 1.5 }).success).toBe(false);
      expect(createTeamSchema.safeParse({ name: "Ops", retentionHours: 0 }).success).toBe(false);
      expect(
        createTeamSchema.safeParse({ name: "Ops", retentionHours: 2_147_483_648 }).success,
      ).toBe(false);
    });
  });

  describe("updateTeamSchema validation", () => {
    it("accepts name, storageQuota, or retentionHours individually", () => {
      expect(updateTeamSchema.safeParse({ name: "NewName" }).success).toBe(true);
      expect(updateTeamSchema.safeParse({ storageQuota: 5000 }).success).toBe(true);
      expect(updateTeamSchema.safeParse({ retentionHours: 48 }).success).toBe(true);
    });

    it("rejects empty object when none of name, storageQuota, or retentionHours is provided", () => {
      const result = updateTeamSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects unknown keys via .strict()", () => {
      const result = updateTeamSchema.safeParse({ name: "NewName", extraField: true });
      expect(result.success).toBe(false);
    });
  });

  describe("route handler behavior (teamsRoutes)", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let postHandler: RouteHandler;
    let putHandler: RouteHandler;
    let deleteHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        get: vi.fn(),
        post: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/teams") postHandler = handler;
        }),
        put: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/teams/:id") putHandler = handler;
        }),
        delete: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/teams/:id") deleteHandler = handler;
        }),
        log: { info: vi.fn() },
      };
      await teamsRoutes(fakeApp as never);
    });

    function makeReply() {
      const reply = {
        statusCode: 200,
        payload: undefined as unknown,
        status: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        send: vi.fn((body: unknown) => {
          reply.payload = body;
          return reply;
        }),
      };
      return reply;
    }

    it("blocks deletion of the Default team with 400", async () => {
      mocks.selectQueue = [[{ id: "default-id", name: "Default" }]];
      const reply = makeReply();
      await deleteHandler({ params: { id: "default-id" } }, reply);
      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toEqual({
        error: "Cannot delete the Default team",
        code: "VALIDATION_ERROR",
      });
      expect(mocks.deleteWhere).not.toHaveBeenCalled();
    });

    it("blocks deletion when team has members and allows deletion when member count is zero", async () => {
      mocks.selectQueue = [[{ id: "eng-id", name: "Engineering" }], [{ count: 3 }]];
      const blockedReply = makeReply();
      await deleteHandler({ params: { id: "eng-id" } }, blockedReply);
      expect(blockedReply.statusCode).toBe(400);
      expect(blockedReply.payload).toEqual({
        error: "Cannot delete a team that has members",
        code: "VALIDATION_ERROR",
      });
      expect(mocks.deleteWhere).not.toHaveBeenCalled();

      mocks.selectQueue = [[{ id: "eng-id", name: "Engineering" }], [{ count: 0 }]];
      const okReply = makeReply();
      await deleteHandler({ params: { id: "eng-id" } }, okReply);
      expect(okReply.statusCode).toBe(200);
      expect(okReply.payload).toEqual({ ok: true });
      expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it("rejects duplicate team names on create and rename with 409", async () => {
      mocks.selectQueue = [[{ id: "t1", name: "engineering" }]];
      const createReply = makeReply();
      await postHandler({ body: { name: "Engineering" } }, createReply);
      expect(createReply.statusCode).toBe(409);
      expect(createReply.payload).toEqual({
        error: "Team name already exists",
        code: "CONFLICT",
      });

      mocks.selectQueue = [[{ id: "t1", name: "engineering" }], [{ id: "t2", name: "design" }]];
      const renameReply = makeReply();
      await putHandler({ params: { id: "t1" }, body: { name: "Design" } }, renameReply);
      expect(renameReply.statusCode).toBe(409);
      expect(renameReply.payload).toEqual({
        error: "Team name already exists",
        code: "CONFLICT",
      });
    });
  });
});
