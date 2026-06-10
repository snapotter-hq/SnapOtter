import type { Permission, Role } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ get: () => null }) }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { roles: {}, settings: {} },
}));

const mockGetAuthUser = vi.fn();
vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}));

import {
  hasEffectivePermission,
  hasPermission,
  requireOwnershipOrPermission,
  requirePermission,
} from "../../../apps/api/src/permissions.js";
import type { AuthUser } from "../../../apps/api/src/plugins/auth.js";

function makeUser(overrides: Partial<AuthUser> & { role: string }): AuthUser {
  return {
    id: "u-test",
    username: "tester",
    ...overrides,
  };
}

function makeMockReply() {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply, sent };
}

beforeEach(() => {
  mockGetAuthUser.mockReset();
});

describe("hasPermission extended", () => {
  const adminPerms: Permission[] = [
    "tools:use",
    "files:own",
    "files:all",
    "apikeys:own",
    "apikeys:all",
    "pipelines:own",
    "pipelines:all",
    "settings:read",
    "settings:write",
    "users:manage",
    "teams:manage",
    "features:manage",
    "system:health",
    "audit:read",
  ];

  it("admin has all 14 permissions", async () => {
    for (const perm of adminPerms) {
      expect(await hasPermission("admin", perm)).toBe(true);
    }
  });

  it("editor has the expected permissions", async () => {
    const editorYes: Permission[] = [
      "tools:use",
      "files:own",
      "files:all",
      "apikeys:own",
      "pipelines:own",
      "pipelines:all",
      "settings:read",
    ];
    for (const perm of editorYes) {
      expect(await hasPermission("editor", perm)).toBe(true);
    }
  });

  it("editor does NOT have admin-only permissions", async () => {
    const editorNo: Permission[] = [
      "users:manage",
      "teams:manage",
      "settings:write",
      "features:manage",
      "system:health",
      "audit:read",
    ];
    for (const perm of editorNo) {
      expect(await hasPermission("editor", perm)).toBe(false);
    }
  });

  it("user has the expected permissions", async () => {
    const userYes: Permission[] = [
      "tools:use",
      "files:own",
      "apikeys:own",
      "pipelines:own",
      "settings:read",
    ];
    for (const perm of userYes) {
      expect(await hasPermission("user", perm)).toBe(true);
    }
  });

  it("user does NOT have elevated permissions", async () => {
    const userNo: Permission[] = [
      "files:all",
      "pipelines:all",
      "users:manage",
      "teams:manage",
      "settings:write",
      "features:manage",
      "apikeys:all",
      "system:health",
      "audit:read",
    ];
    for (const perm of userNo) {
      expect(await hasPermission("user", perm)).toBe(false);
    }
  });

  it("unknown role returns false for any permission", async () => {
    expect(await hasPermission("ghost" as Role, "tools:use")).toBe(false);
    expect(await hasPermission("ghost" as Role, "users:manage")).toBe(false);
  });
});

describe("hasEffectivePermission extended", () => {
  it("admin without apiKeyPermissions has all permissions", async () => {
    const admin = makeUser({ role: "admin" });
    expect(await hasEffectivePermission(admin, "tools:use")).toBe(true);
    expect(await hasEffectivePermission(admin, "users:manage")).toBe(true);
    expect(await hasEffectivePermission(admin, "audit:read")).toBe(true);
  });

  it("user with apiKeyPermissions only gets intersecting permissions", async () => {
    const user = makeUser({
      role: "user",
      apiKeyPermissions: ["tools:use", "settings:read"],
    });
    expect(await hasEffectivePermission(user, "tools:use")).toBe(true);
    expect(await hasEffectivePermission(user, "settings:read")).toBe(true);
    expect(await hasEffectivePermission(user, "files:own")).toBe(false);
  });

  it("apiKeyPermissions that include the permission returns true", async () => {
    const editor = makeUser({
      role: "editor",
      apiKeyPermissions: ["files:all"],
    });
    expect(await hasEffectivePermission(editor, "files:all")).toBe(true);
  });

  it("apiKeyPermissions that do NOT include the permission returns false", async () => {
    const editor = makeUser({
      role: "editor",
      apiKeyPermissions: ["tools:use"],
    });
    expect(await hasEffectivePermission(editor, "files:all")).toBe(false);
  });

  it("role lacking the permission returns false even if apiKeyPermissions include it", async () => {
    const user = makeUser({
      role: "user",
      apiKeyPermissions: ["users:manage", "settings:write"],
    });
    expect(await hasEffectivePermission(user, "users:manage")).toBe(false);
    expect(await hasEffectivePermission(user, "settings:write")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns null and sends 401 when getAuthUser returns null", async () => {
    mockGetAuthUser.mockReturnValue(null);
    const { reply, sent } = makeMockReply();
    const result = await requirePermission("tools:use")({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  });

  it("returns null and sends 403 when user lacks permission", async () => {
    mockGetAuthUser.mockReturnValue(makeUser({ role: "user" }));
    const { reply, sent } = makeMockReply();
    const result = await requirePermission("users:manage")({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({
      error: "Insufficient permissions",
      code: "FORBIDDEN",
    });
  });

  it("returns user when user has the permission", async () => {
    const admin = makeUser({ role: "admin" });
    mockGetAuthUser.mockReturnValue(admin);
    const { reply } = makeMockReply();
    const result = await requirePermission("users:manage")({} as never, reply as never);
    expect(result).toEqual(admin);
  });

  it("returns user when editor has an editor-level permission", async () => {
    const editor = makeUser({ role: "editor" });
    mockGetAuthUser.mockReturnValue(editor);
    const { reply } = makeMockReply();
    const result = await requirePermission("tools:use")({} as never, reply as never);
    expect(result).toEqual(editor);
  });
});

describe("requireOwnershipOrPermission", () => {
  it("returns null and sends 401 when no user", async () => {
    mockGetAuthUser.mockReturnValue(null);
    const { reply, sent } = makeMockReply();
    const result = await requireOwnershipOrPermission(
      {} as never,
      reply as never,
      "other-user",
      "files:all",
    );
    expect(result).toBeNull();
    expect(sent.status).toBe(401);
  });

  it("returns user when resourceUserId matches user.id (own resource)", async () => {
    const user = makeUser({ role: "user", id: "u-owner" });
    mockGetAuthUser.mockReturnValue(user);
    const { reply } = makeMockReply();
    const result = await requireOwnershipOrPermission(
      {} as never,
      reply as never,
      "u-owner",
      "files:all",
    );
    expect(result).toEqual(user);
  });

  it("returns user when user has the allPermission", async () => {
    const admin = makeUser({ role: "admin", id: "u-admin" });
    mockGetAuthUser.mockReturnValue(admin);
    const { reply } = makeMockReply();
    const result = await requireOwnershipOrPermission(
      {} as never,
      reply as never,
      "u-someone-else",
      "files:all",
    );
    expect(result).toEqual(admin);
  });

  it("returns null when not owner and lacks allPermission", async () => {
    const user = makeUser({ role: "user", id: "u-basic" });
    mockGetAuthUser.mockReturnValue(user);
    const { reply } = makeMockReply();
    const result = await requireOwnershipOrPermission(
      {} as never,
      reply as never,
      "u-someone-else",
      "files:all",
    );
    expect(result).toBeNull();
  });
});
