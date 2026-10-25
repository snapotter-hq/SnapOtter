/**
 * Unit tests for roles route validation and role management logic.
 *
 * Tests the role name validation, create/update schemas (including toolPermissions),
 * builtin role protection, permission validation, and user reassignment on role deletion
 * from apps/api/src/routes/roles.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  insertedValues: undefined as Record<string, unknown> | undefined,
  insertRowCount: 1,
  updateCalls: [] as Array<{ table: unknown; values: unknown; where: unknown }>,
  deleteCalls: [] as Array<{ table: unknown; where: unknown }>,
  requirePermission: vi.fn(
    () => () => Promise.resolve({ id: "admin-1", username: "admin-user", role: "admin" }),
  ),
  hasEffectivePermission: vi.fn(() => Promise.resolve(true)),
  canAssignRole: vi.fn(() => Promise.resolve(true)),
  canGrantRoleDefinition: vi.fn(() => Promise.resolve(true)),
  canManageRoleDefinition: vi.fn(() => Promise.resolve(true)),
  auditFn: vi.fn(() => Promise.resolve()),
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    sql: strings.join("?"),
    vals,
  }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => {
  const makeSelectChain = () => ({
    from: () => ({
      where: () => {
        const res = Promise.resolve(mocks.selectRows);
        return Object.assign(res, {
          for: () => Promise.resolve(mocks.selectRows),
        });
      },
      groupBy: () => Promise.resolve([]),
      // biome-ignore lint/suspicious/noThenProperty: mock Drizzle query builder promise chain
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.selectRows).then(resolve),
    }),
  });
  const dbObj = {
    select: makeSelectChain,
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        mocks.insertedValues = vals;
        return {
          onConflictDoNothing: () => Promise.resolve({ rowCount: mocks.insertRowCount }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: (where: unknown) => {
          mocks.updateCalls.push({ table, values, where });
          return Promise.resolve({ rowCount: 1 });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: unknown) => {
        mocks.deleteCalls.push({ table, where });
        return Promise.resolve();
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return {
    db: dbObj,
    pool: {},
    closeDb: async () => {},
    schema: {
      roles: { id: "roles.id", name: "roles.name" },
      users: { id: "users.id", role: "users.role" },
    },
  };
});

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: mocks.requirePermission,
  hasEffectivePermission: mocks.hasEffectivePermission,
  canAssignRole: mocks.canAssignRole,
  canGrantRoleDefinition: mocks.canGrantRoleDefinition,
  canManageRoleDefinition: mocks.canManageRoleDefinition,
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => mocks.auditFn,
}));

import {
  ALL_PERMISSIONS,
  createRoleSchema,
  roleNameField,
  rolesRoutes,
  updateRoleSchema,
  validatePermissions,
} from "../../../apps/api/src/routes/roles.js";

// ── Tests ───────────────────────────────────────────────────────────────

describe("roles route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows = [];
    mocks.insertedValues = undefined;
    mocks.insertRowCount = 1;
    mocks.updateCalls = [];
    mocks.deleteCalls = [];
    mocks.requirePermission.mockImplementation(
      () => () => Promise.resolve({ id: "admin-1", username: "admin-user", role: "admin" }),
    );
    mocks.hasEffectivePermission.mockResolvedValue(true);
    mocks.canAssignRole.mockResolvedValue(true);
    mocks.canGrantRoleDefinition.mockResolvedValue(true);
    mocks.canManageRoleDefinition.mockResolvedValue(true);
  });

  describe("role name validation (roleNameField)", () => {
    it("accepts valid lowercase name", () => {
      const result = roleNameField.safeParse("viewer");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("viewer");
    });

    it("converts to lowercase", () => {
      const result = roleNameField.safeParse("Viewer");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("viewer");
    });

    it("trims whitespace and lowercases", () => {
      const result = roleNameField.safeParse("  Manager  ");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("manager");
    });

    it("allows hyphens", () => {
      const result = roleNameField.safeParse("team-lead");
      expect(result.success).toBe(true);
    });

    it("allows underscores", () => {
      const result = roleNameField.safeParse("team_lead");
      expect(result.success).toBe(true);
    });

    it("allows numbers", () => {
      const result = roleNameField.safeParse("admin2");
      expect(result.success).toBe(true);
    });

    it("rejects single character", () => {
      const result = roleNameField.safeParse("a");
      expect(result.success).toBe(false);
    });

    it("rejects names longer than 30 characters", () => {
      const result = roleNameField.safeParse("a".repeat(31));
      expect(result.success).toBe(false);
    });

    it("accepts name exactly 30 characters", () => {
      const result = roleNameField.safeParse("a".repeat(30));
      expect(result.success).toBe(true);
    });

    it("accepts name exactly 2 characters", () => {
      const result = roleNameField.safeParse("ab");
      expect(result.success).toBe(true);
    });

    it("rejects spaces in name", () => {
      const result = roleNameField.safeParse("team lead");
      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = roleNameField.safeParse("admin@role");
      expect(result.success).toBe(false);
    });

    it("rejects dots in name", () => {
      const result = roleNameField.safeParse("admin.role");
      expect(result.success).toBe(false);
    });
  });

  describe("create role validation (createRoleSchema)", () => {
    it("accepts valid create payload", () => {
      const result = createRoleSchema.safeParse({
        name: "reviewer",
        description: "Can review files",
        permissions: ["tools:use", "files:own"],
      });
      expect(result.success).toBe(true);
    });

    it("description is optional", () => {
      const result = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: ["tools:use"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional or nullable toolPermissions", () => {
      const withCategory = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: ["tools:use"],
        toolPermissions: { mode: "category", allowed: ["image"] },
      });
      expect(withCategory.success).toBe(true);

      const withNull = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: ["tools:use"],
        toolPermissions: null,
      });
      expect(withNull.success).toBe(true);

      const withInvalidMode = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: ["tools:use"],
        toolPermissions: { mode: "invalid", allowed: [] },
      });
      expect(withInvalidMode.success).toBe(false);
    });

    it("requires at least one permission", () => {
      const result = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing permissions", () => {
      const result = createRoleSchema.safeParse({
        name: "reviewer",
      });
      expect(result.success).toBe(false);
    });

    it("rejects description longer than 500 characters", () => {
      const result = createRoleSchema.safeParse({
        name: "reviewer",
        permissions: ["tools:use"],
        description: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update role validation (updateRoleSchema)", () => {
    it("accepts partial update with just name", () => {
      const result = updateRoleSchema.safeParse({ name: "new-name" });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with just description", () => {
      const result = updateRoleSchema.safeParse({ description: "Updated description" });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with just permissions", () => {
      const result = updateRoleSchema.safeParse({ permissions: ["tools:use", "files:own"] });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with toolPermissions", () => {
      const result = updateRoleSchema.safeParse({
        toolPermissions: { mode: "tool", allowed: ["resize"] },
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty update body", () => {
      const result = updateRoleSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts all fields together", () => {
      const result = updateRoleSchema.safeParse({
        name: "updated-role",
        description: "New desc",
        permissions: ["tools:use"],
        toolPermissions: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty permissions array (#2887)", () => {
      const result = updateRoleSchema.safeParse({ permissions: [] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message).join("; ")).toBe(
          "At least one permission is required",
        );
      }
    });
  });

  describe("permission validation (validatePermissions)", () => {
    it("returns empty array for valid permissions", () => {
      const invalid = validatePermissions(["tools:use", "files:own"]);
      expect(invalid).toHaveLength(0);
    });

    it("returns invalid permission strings", () => {
      const invalid = validatePermissions(["tools:use", "invalid:perm", "also:bad"]);
      expect(invalid).toEqual(["invalid:perm", "also:bad"]);
    });

    it("returns all permissions if all are invalid", () => {
      const invalid = validatePermissions(["foo", "bar"]);
      expect(invalid).toEqual(["foo", "bar"]);
    });

    it("handles empty array", () => {
      const invalid = validatePermissions([]);
      expect(invalid).toHaveLength(0);
    });
  });

  describe("ALL_PERMISSIONS constant", () => {
    it("contains exactly 17 permissions", () => {
      expect(ALL_PERMISSIONS).toHaveLength(17);
    });

    it("contains all expected permissions", () => {
      expect(ALL_PERMISSIONS).toContain("tools:use");
      expect(ALL_PERMISSIONS).toContain("files:own");
      expect(ALL_PERMISSIONS).toContain("files:all");
      expect(ALL_PERMISSIONS).toContain("apikeys:own");
      expect(ALL_PERMISSIONS).toContain("apikeys:all");
      expect(ALL_PERMISSIONS).toContain("pipelines:own");
      expect(ALL_PERMISSIONS).toContain("pipelines:all");
      expect(ALL_PERMISSIONS).toContain("settings:read");
      expect(ALL_PERMISSIONS).toContain("settings:write");
      expect(ALL_PERMISSIONS).toContain("users:manage");
      expect(ALL_PERMISSIONS).toContain("teams:manage");
      expect(ALL_PERMISSIONS).toContain("features:manage");
      expect(ALL_PERMISSIONS).toContain("system:health");
      expect(ALL_PERMISSIONS).toContain("audit:read");
      expect(ALL_PERMISSIONS).toContain("compliance:manage");
      expect(ALL_PERMISSIONS).toContain("webhooks:manage");
      expect(ALL_PERMISSIONS).toContain("security:manage");
    });
  });

  describe("route handler behavior (rolesRoutes)", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let postHandler: RouteHandler;
    let putHandler: RouteHandler;
    let deleteHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        get: vi.fn(),
        post: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/roles") postHandler = handler;
        }),
        put: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/roles/:id") putHandler = handler;
        }),
        delete: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/roles/:id") deleteHandler = handler;
        }),
        log: { info: vi.fn() },
      };
      await rolesRoutes(fakeApp as never);
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

    it("blocks modification and deletion of built-in roles with 400", async () => {
      mocks.selectRows = [
        {
          id: "builtin-admin",
          name: "admin",
          isBuiltin: true,
          permissions: ["tools:use"],
          toolPermissions: null,
        },
      ];

      const putReply = makeReply();
      await putHandler(
        {
          params: { id: "builtin-admin" },
          body: { description: "edited" },
          log: { info: vi.fn() },
        },
        putReply,
      );
      expect(putReply.statusCode).toBe(400);
      expect(putReply.payload).toEqual({
        error: "Cannot modify built-in roles",
        code: "VALIDATION_ERROR",
      });

      const deleteReply = makeReply();
      await deleteHandler({ params: { id: "builtin-admin" }, log: { info: vi.fn() } }, deleteReply);
      expect(deleteReply.statusCode).toBe(400);
      expect(deleteReply.payload).toEqual({
        error: "Cannot delete built-in roles",
        code: "VALIDATION_ERROR",
      });
    });

    it("audits ROLE_CREATED with acting adminId, username, roleId, and roleName (#3978)", async () => {
      mocks.selectRows = [];

      const reply = makeReply();
      await postHandler(
        {
          body: {
            name: "reviewer",
            description: "Can review files",
            permissions: ["tools:use"],
          },
          log: { info: vi.fn() },
        },
        reply,
      );
      expect(reply.statusCode).toBe(201);
      expect(mocks.auditFn).toHaveBeenCalledWith("ROLE_CREATED", {
        adminId: "admin-1",
        username: "admin-user",
        roleId: expect.any(String),
        roleName: "reviewer",
      });
    });

    it("cascades role rename to users and updates role row", async () => {
      mocks.selectRows = [
        {
          id: "role-1",
          name: "old-name",
          isBuiltin: false,
          permissions: ["tools:use"],
          toolPermissions: null,
        },
      ];

      const reply = makeReply();
      await putHandler(
        { params: { id: "role-1" }, body: { name: "new-name" }, log: { info: vi.fn() } },
        reply,
      );
      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({ ok: true });
      expect(mocks.updateCalls).toHaveLength(2);
      expect(mocks.auditFn).toHaveBeenCalledWith("ROLE_UPDATED", {
        adminId: "admin-1",
        username: "admin-user",
        roleId: "role-1",
      });
    });

    it("reassigns users on deleted custom role to 'user' before deleting the role", async () => {
      mocks.selectRows = [
        {
          id: "role-1",
          name: "reviewer",
          isBuiltin: false,
          permissions: ["tools:use"],
          toolPermissions: null,
        },
      ];

      const reply = makeReply();
      await deleteHandler({ params: { id: "role-1" }, log: { info: vi.fn() } }, reply);
      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({ ok: true });
      expect(mocks.updateCalls).toHaveLength(1);
      expect(mocks.deleteCalls).toHaveLength(1);
      expect(mocks.auditFn).toHaveBeenCalledWith("ROLE_DELETED", {
        adminId: "admin-1",
        username: "admin-user",
        roleId: "role-1",
        roleName: "reviewer",
      });
    });
  });
});
