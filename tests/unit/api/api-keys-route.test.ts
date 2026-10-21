/**
 * Unit tests for API key route validation and helper logic.
 *
 * Tests the create API key schema, permission scoping logic,
 * expiration date validation, key prefix computation, and route handlers
 * from apps/api/src/routes/api-keys.ts and apps/api/src/plugins/auth.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertedValues: undefined as Record<string, unknown> | undefined,
  selectRows: [] as unknown[],
  whereSelectRows: [] as unknown[],
  deleteWhere: vi.fn(() => Promise.resolve()),
  auditFn: vi.fn(() => Promise.resolve()),
  hasEffectivePermission: vi.fn<(user: unknown, perm: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  ),
  permissionsNotHeldBy: vi.fn<(user: unknown, perms: string[]) => Promise<string[]>>(() =>
    Promise.resolve([]),
  ),
  getEffectivePermissions: vi.fn<(user: unknown) => Promise<string[]>>(() =>
    Promise.resolve(["tools:use", "files:own"]),
  ),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conds: unknown[]) => ({ op: "and", conds }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        mocks.insertedValues = vals;
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mocks.whereSelectRows),
        // biome-ignore lint/suspicious/noThenProperty: mock Drizzle query builder promise chain
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.selectRows).then(resolve),
      }),
    }),
    delete: () => ({
      where: mocks.deleteWhere,
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    apiKeys: {
      id: "id",
      userId: "user_id",
      name: "name",
      keyPrefix: "key_prefix",
      permissions: "permissions",
      createdAt: "created_at",
      lastUsedAt: "last_used_at",
      expiresAt: "expires_at",
    },
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => mocks.auditFn,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: (...args: [unknown, string]) => mocks.hasEffectivePermission(...args),
  permissionsNotHeldBy: (...args: [unknown, string[]]) => mocks.permissionsNotHeldBy(...args),
  getEffectivePermissions: (...args: [unknown]) => mocks.getEffectivePermissions(...args),
}));

import { type AuthUser, computeKeyPrefix } from "../../../apps/api/src/plugins/auth.js";
import {
  apiKeyRoutes,
  createApiKeySchema,
  deriveApiKeyPermissionsForCreate,
  serializeApiKeyRow,
  validateExpiresAt,
} from "../../../apps/api/src/routes/api-keys.js";

const testUser: AuthUser = {
  id: "user-1",
  username: "alice",
  role: "admin",
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("API keys route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedValues = undefined;
    mocks.selectRows = [];
    mocks.whereSelectRows = [];
    mocks.hasEffectivePermission.mockResolvedValue(true);
    mocks.permissionsNotHeldBy.mockResolvedValue([]);
    mocks.getEffectivePermissions.mockResolvedValue(["tools:use", "files:own"]);
  });

  describe("create API key validation (createApiKeySchema)", () => {
    it("accepts empty object (all fields optional)", () => {
      const result = createApiKeySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid name", () => {
      const result = createApiKeySchema.safeParse({ name: "My Key" });
      expect(result.success).toBe(true);
    });

    it("rejects name longer than 100 characters", () => {
      const result = createApiKeySchema.safeParse({ name: "x".repeat(101) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Key name must be 100 characters or fewer");
      }
    });

    it("accepts name exactly 100 characters", () => {
      const result = createApiKeySchema.safeParse({ name: "x".repeat(100) });
      expect(result.success).toBe(true);
    });

    it("accepts permissions array", () => {
      const result = createApiKeySchema.safeParse({
        permissions: ["tools:use", "files:own"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty permissions array", () => {
      const result = createApiKeySchema.safeParse({ permissions: [] });
      expect(result.success).toBe(true);
    });

    it("rejects non-array permissions", () => {
      const result = createApiKeySchema.safeParse({ permissions: "tools:use" });
      expect(result.success).toBe(false);
    });

    it("accepts valid expiresAt date string", () => {
      const result = createApiKeySchema.safeParse({
        expiresAt: "2030-01-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all fields together", () => {
      const result = createApiKeySchema.safeParse({
        name: "Production Key",
        permissions: ["tools:use"],
        expiresAt: "2030-12-31T23:59:59Z",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("key prefix computation (computeKeyPrefix)", () => {
    it("returns the first 16 hex characters of the SHA-256 digest", () => {
      const key = "si_abcdefghijklmnop";
      const prefix = computeKeyPrefix(key);
      expect(prefix).toMatch(/^[0-9a-f]{16}$/);
      expect(prefix).not.toContain("si_");
    });

    it("is deterministic and distinct for different keys", () => {
      const a = computeKeyPrefix("si_abc");
      const b = computeKeyPrefix("si_def");
      expect(a).toBe(computeKeyPrefix("si_abc"));
      expect(a).not.toBe(b);
      expect(a).toHaveLength(16);
      expect(b).toHaveLength(16);
    });
  });

  describe("permission scoping (deriveApiKeyPermissionsForCreate)", () => {
    it("passes when all requested permissions are held by the user", async () => {
      const held = new Set(["tools:use", "files:own", "files:all"]);
      mocks.permissionsNotHeldBy.mockImplementation(async (_u, req) =>
        req.filter((p) => !held.has(p)),
      );
      const result = await deriveApiKeyPermissionsForCreate(testUser, ["tools:use", "files:own"]);
      expect(result.invalid).toHaveLength(0);
      expect(result.permissions).toEqual(["tools:use", "files:own"]);
    });

    it("returns invalid permissions when requesting permissions user does not have", async () => {
      const held = new Set(["tools:use", "files:own"]);
      mocks.permissionsNotHeldBy.mockImplementation(async (_u, req) =>
        req.filter((p) => !held.has(p)),
      );
      const result = await deriveApiKeyPermissionsForCreate(testUser, [
        "tools:use",
        "users:manage",
      ]);
      expect(result.invalid).toEqual(["users:manage"]);
    });

    it("returns all invalid permissions", async () => {
      const held = new Set(["tools:use"]);
      mocks.permissionsNotHeldBy.mockImplementation(async (_u, req) =>
        req.filter((p) => !held.has(p)),
      );
      const result = await deriveApiKeyPermissionsForCreate(testUser, [
        "tools:use",
        "users:manage",
        "features:manage",
      ]);
      expect(result.invalid).toEqual(["users:manage", "features:manage"]);
    });

    it("preserves an explicit empty permissions array", async () => {
      const result = await deriveApiKeyPermissionsForCreate(testUser, []);
      expect(result).toEqual({ permissions: [], invalid: [] });
    });

    it("returns null permissions when session caller omits permissions", async () => {
      const result = await deriveApiKeyPermissionsForCreate(testUser);
      expect(result).toEqual({ permissions: null, invalid: [] });
    });

    it("inherits effective permissions when a scoped API key caller omits permissions", async () => {
      mocks.getEffectivePermissions.mockResolvedValueOnce(["tools:use"]);
      const result = await deriveApiKeyPermissionsForCreate({
        ...testUser,
        apiKeyPermissions: ["tools:use"],
      });
      expect(result).toEqual({ permissions: ["tools:use"], invalid: [] });
    });
  });

  describe("expiresAt validation (validateExpiresAt)", () => {
    it("rejects invalid date string", () => {
      const result = validateExpiresAt("not-a-date");
      expect(result).toEqual({ valid: false, error: "Invalid expiresAt date" });
    });

    it("rejects date in the past", () => {
      const result = validateExpiresAt("2020-01-01T00:00:00Z");
      expect(result).toEqual({ valid: false, error: "expiresAt must be in the future" });
    });

    it("accepts date in the future", () => {
      const result = validateExpiresAt("2030-06-15T12:00:00Z");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.date).toBeInstanceOf(Date);
        expect(result.date.toISOString()).toBe("2030-06-15T12:00:00.000Z");
      }
    });

    it("rejects empty string", () => {
      const result = validateExpiresAt("");
      expect(result.valid).toBe(false);
    });
  });

  describe("response serialization (serializeApiKeyRow)", () => {
    it("formats key list entry with jsonb permissions array and prefix", () => {
      const row = {
        id: "key-1",
        name: "Test Key",
        keyPrefix: "0123456789abcdef",
        permissions: ["tools:use"],
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastUsedAt: new Date("2025-06-01T12:00:00Z"),
        expiresAt: new Date("2026-01-01T00:00:00Z"),
      };

      const serialized = serializeApiKeyRow(row);
      expect(serialized).toEqual({
        id: "key-1",
        name: "Test Key",
        prefix: "0123456789abcdef",
        permissions: ["tools:use"],
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUsedAt: "2025-06-01T12:00:00.000Z",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("handles null permissions, null keyPrefix, and null dates", () => {
      const row = {
        id: "key-2",
        name: "No Scope Key",
        keyPrefix: null,
        permissions: null,
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastUsedAt: null,
        expiresAt: null,
      };

      const serialized = serializeApiKeyRow(row);
      expect(serialized).toEqual({
        id: "key-2",
        name: "No Scope Key",
        prefix: "",
        permissions: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUsedAt: null,
        expiresAt: null,
      });
    });
  });

  describe("route handler behavior (apiKeyRoutes)", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let postHandler: RouteHandler;
    let getHandler: RouteHandler;
    let deleteHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/api-keys") postHandler = handler;
        }),
        get: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/api-keys") getHandler = handler;
        }),
        delete: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/api-keys/:id") deleteHandler = handler;
        }),
        log: { info: vi.fn() },
      };
      await apiKeyRoutes(fakeApp as never);
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

    it("generates a raw key with si_ + 96 hex chars and defaults blank names to 'Default API Key'", async () => {
      const reply = makeReply();
      await postHandler(
        {
          user: testUser,
          body: { name: "   " },
          log: { info: vi.fn() },
          ip: "127.0.0.1",
          id: "req-1",
        },
        reply,
      );
      expect(reply.statusCode).toBe(201);
      const body = reply.payload as { name: string; key: string };
      expect(body.name).toBe("Default API Key");
      expect(body.key).toMatch(/^si_[0-9a-f]{96}$/);
      expect(body.key).toHaveLength(99);
      expect(mocks.insertedValues?.keyPrefix).toBe(computeKeyPrefix(body.key));
    });

    it("serializes GET /api/v1/api-keys rows from jsonb permissions without JSON.parse", async () => {
      mocks.selectRows = [
        {
          id: "key-1",
          name: "Key One",
          keyPrefix: "abcdef0123456789",
          permissions: ["tools:use", "files:own"],
          createdAt: new Date("2025-01-01T00:00:00Z"),
          lastUsedAt: null,
          expiresAt: null,
        },
      ];
      const reply = makeReply();
      await getHandler({ user: testUser }, reply);
      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({
        apiKeys: [
          {
            id: "key-1",
            name: "Key One",
            prefix: "abcdef0123456789",
            permissions: ["tools:use", "files:own"],
            createdAt: "2025-01-01T00:00:00.000Z",
            lastUsedAt: null,
            expiresAt: null,
          },
        ],
      });
    });

    it("returns 404 when deleting a missing key and 200 when deleting an owned key", async () => {
      mocks.whereSelectRows = [];
      const missReply = makeReply();
      await deleteHandler({ user: testUser, params: { id: "key-missing" } }, missReply);
      expect(missReply.statusCode).toBe(404);
      expect(missReply.payload).toEqual({ error: "API key not found", code: "NOT_FOUND" });
      expect(mocks.deleteWhere).not.toHaveBeenCalled();

      mocks.whereSelectRows = [{ id: "key-1", userId: testUser.id }];
      const okReply = makeReply();
      await deleteHandler(
        {
          user: testUser,
          params: { id: "key-1" },
          log: { info: vi.fn() },
          ip: "127.0.0.1",
          id: "req-2",
        },
        okReply,
      );
      expect(okReply.statusCode).toBe(200);
      expect(okReply.payload).toEqual({ ok: true });
      expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
    });
  });
});
