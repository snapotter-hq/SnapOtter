/**
 * Unit tests for the authority + tool-access surface of permissions.ts that the
 * existing permission suites do not reach: custom-role resolution from the DB,
 * per-tool/category tool-access gating (with and without the enterprise
 * per_tool_permissions feature), the tool-scope containment matrix used when one
 * role grants another, and the requireFullAdmin / requirePermission /
 * requireToolAccess Fastify guards.
 *
 * permissions.ts lazily imports @snapotter/enterprise and @snapotter/shared
 * inside its functions, so each test loads the module fresh via vi.resetModules
 * + vi.doMock + dynamic import. That lets a single test toggle the enterprise
 * feature (or force the enterprise import to throw) and queue custom-role rows on
 * the DB mock, while @snapotter/shared keeps its real TOOLS via importOriginal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleToolPermissions } from "../../../apps/api/src/permissions.js";
import type { AuthUser } from "../../../apps/api/src/plugins/auth.js";

// ── Hoisted mock handles (shared across freshly-imported module graphs) ──

const selectMock = vi.hoisted(() => vi.fn());
const isFeatureEnabledMock = vi.hoisted(() => vi.fn());
const getAuthUserMock = vi.hoisted(() => vi.fn());

type CustomRoleRow = {
  permissions: string[];
  toolPermissions: RoleToolPermissions | null;
};

type PermissionsModule = typeof import("../../../apps/api/src/permissions.js");

// Chain builder for db.select(...).from(...).where(...).limit(...).
function selectChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

/**
 * Load a fresh permissions module with fully controlled dependencies.
 * - perToolEnforced: value returned by isFeatureEnabled("per_tool_permissions").
 * - enterpriseImportThrows: makes the dynamic import("@snapotter/enterprise")
 *   reject, exercising the isPerToolPermissionEnforced catch (fail-closed).
 * - customRoles: queued in order for each getRoleDefinition DB lookup.
 */
async function loadPermissions(
  options: {
    perToolEnforced?: boolean;
    enterpriseImportThrows?: boolean;
    customRoles?: CustomRoleRow[];
  } = {},
): Promise<PermissionsModule> {
  vi.resetModules();
  selectMock.mockReset();
  isFeatureEnabledMock.mockReset();
  getAuthUserMock.mockReset();

  isFeatureEnabledMock.mockImplementation(
    (feature: string) => feature === "per_tool_permissions" && (options.perToolEnforced ?? false),
  );

  for (const row of options.customRoles ?? []) {
    selectMock.mockReturnValueOnce(selectChain([row]));
  }

  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: { select: selectMock },
    pool: {},
    closeDb: async () => {},
    schema: {
      roles: { name: "name", permissions: "permissions", toolPermissions: "tool_permissions" },
      settings: {},
    },
  }));

  vi.doMock("drizzle-orm", () => ({ eq: () => "mocked-eq" }));

  vi.doMock("../../../apps/api/src/plugins/auth.js", () => ({
    getAuthUser: (...args: unknown[]) => getAuthUserMock(...args),
  }));

  if (options.enterpriseImportThrows) {
    vi.doMock("@snapotter/enterprise", () => {
      throw new Error("enterprise module unavailable");
    });
  } else {
    vi.doMock("@snapotter/enterprise", () => ({
      isFeatureEnabled: (feature: string) => isFeatureEnabledMock(feature),
      getActiveLicense: () => null,
      initEnterprise: vi.fn(),
      loadS3Storage: vi.fn(),
      ENTERPRISE_FEATURES: [],
      PLAN_FEATURES: { team: [], enterprise: [] },
    }));
  }

  return import("../../../apps/api/src/permissions.js");
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthUser> & { role: string }): AuthUser {
  return { id: "u-1", username: "tester", ...overrides };
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

const ALL_ADMIN_PERMISSIONS = [
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
  "compliance:manage",
  "webhooks:manage",
  "security:manage",
];

beforeEach(() => {
  selectMock.mockReset();
  isFeatureEnabledMock.mockReset();
  getAuthUserMock.mockReset();
});

// ── hasToolAccess: built-in roles (no tool restrictions) ─────────────

describe("hasToolAccess for built-in roles", () => {
  it("grants access when the role has no tool restrictions (user role)", async () => {
    const { hasToolAccess } = await loadPermissions();
    expect(await hasToolAccess("user", "resize")).toBe(true);
    // Built-in roles resolve from ROLE_PERMISSIONS, so no DB lookup happens.
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("denies access for a disabled role (getRoleDefinition returns null)", async () => {
    const { hasToolAccess } = await loadPermissions();
    expect(await hasToolAccess("disabled:user", "resize")).toBe(false);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("denies access for an unknown role with no DB match", async () => {
    const { hasToolAccess } = await loadPermissions({ customRoles: [] });
    // No queued row => empty result => custom role not found.
    selectMock.mockReturnValueOnce(selectChain([]));
    expect(await hasToolAccess("ghost", "resize")).toBe(false);
  });
});

// ── hasToolAccess: custom role, category mode ────────────────────────

describe("hasToolAccess for custom category-mode roles", () => {
  it("allows a tool whose modality is in the category allowlist", async () => {
    // resize has modality "image".
    const { hasToolAccess } = await loadPermissions({
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    expect(await hasToolAccess("photographer", "resize")).toBe(true);
  });

  it("denies a tool whose modality is not in the category allowlist", async () => {
    // convert-video has modality "video", not in the image-only allowlist.
    const { hasToolAccess } = await loadPermissions({
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    expect(await hasToolAccess("photographer", "convert-video")).toBe(false);
  });

  it("denies access when the tool id does not exist in TOOLS (category mode)", async () => {
    const { hasToolAccess } = await loadPermissions({
      customRoles: [
        {
          permissions: ["tools:use"],
          toolPermissions: { mode: "category", allowed: ["image", "video", "audio"] },
        },
      ],
    });
    expect(await hasToolAccess("photographer", "no-such-tool")).toBe(false);
  });
});

// ── hasToolAccess: custom role, tool mode (enterprise gated) ─────────

describe("hasToolAccess for custom tool-mode roles", () => {
  it("behaves as unrestricted when per_tool_permissions is NOT enforced", async () => {
    // Even a tool NOT in the allowlist is permitted without the enterprise feature.
    const { hasToolAccess } = await loadPermissions({
      perToolEnforced: false,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "tool", allowed: ["crop"] } },
      ],
    });
    expect(await hasToolAccess("restricted", "resize")).toBe(true);
  });

  it("enforces the tool allowlist when per_tool_permissions IS enforced (allowed)", async () => {
    const { hasToolAccess } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        {
          permissions: ["tools:use"],
          toolPermissions: { mode: "tool", allowed: ["resize", "crop"] },
        },
      ],
    });
    expect(await hasToolAccess("restricted", "resize")).toBe(true);
  });

  it("enforces the tool allowlist when per_tool_permissions IS enforced (denied)", async () => {
    const { hasToolAccess } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "tool", allowed: ["crop"] } },
      ],
    });
    expect(await hasToolAccess("restricted", "resize")).toBe(false);
  });

  it("treats tool restrictions as unrestricted when the enterprise import throws", async () => {
    // isPerToolPermissionEnforced catch => fail-closed to "not enforced", which
    // for tool-mode means graceful degradation to unrestricted.
    const { hasToolAccess } = await loadPermissions({
      enterpriseImportThrows: true,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "tool", allowed: ["crop"] } },
      ],
    });
    expect(await hasToolAccess("restricted", "resize")).toBe(true);
  });
});

// ── isToolScopeContained via canGrantRoleDefinition (actor = custom) ──
//
// canGrantRoleDefinition looks up ONLY the actor's role from the DB; the target
// definition is the literal passed in. That isolates the containment matrix to
// a single queued DB row per call.

describe("tool-scope containment (canGrantRoleDefinition)", () => {
  it("a tool-mode actor with the feature off contains any tool-mode target", async () => {
    // actorToolPermissions.mode === "tool" && !enforced => contained; the actor
    // also holds the requested base permission (tools:use).
    const { canGrantRoleDefinition } = await loadPermissions({
      perToolEnforced: false,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "tool", allowed: ["resize"] } },
      ],
    });
    const actor = makeUser({ role: "power-tool", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "tool",
      allowed: ["resize", "crop"],
    });
    expect(ok).toBe(true);
  });

  it("a finite per-tool actor allowlist cannot contain an open-ended category target", async () => {
    // Feature enforced; actor tool-mode, target category-mode => a per-tool
    // allowlist cannot contain an open-ended category grant.
    const { canGrantRoleDefinition } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        {
          permissions: ["tools:use"],
          toolPermissions: { mode: "tool", allowed: ["resize", "crop"] },
        },
      ],
    });
    const actor = makeUser({ role: "power-tool", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "category",
      allowed: ["image"],
    });
    expect(ok).toBe(false);
  });

  it("a category actor contains a tool target when every target tool maps into an allowed modality", async () => {
    // Feature enforced; actor category-mode ["image"], target tool-mode [resize].
    // resize modality "image" is in the actor allowlist => contained.
    const { canGrantRoleDefinition } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    const actor = makeUser({ role: "imager", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "tool",
      allowed: ["resize"],
    });
    expect(ok).toBe(true);
  });

  it("a category actor does NOT contain a tool target whose tool maps to a disallowed modality", async () => {
    // Actor category ["image"], target tool [convert-video] (modality "video").
    const { canGrantRoleDefinition } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    const actor = makeUser({ role: "imager", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "tool",
      allowed: ["convert-video"],
    });
    expect(ok).toBe(false);
  });

  it("a category actor does NOT contain a tool target referencing an unknown tool id", async () => {
    const { canGrantRoleDefinition } = await loadPermissions({
      perToolEnforced: true,
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    const actor = makeUser({ role: "imager", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "tool",
      allowed: ["no-such-tool"],
    });
    expect(ok).toBe(false);
  });

  it("same-mode category containment: target categories must be a subset of the actor's", async () => {
    const { canGrantRoleDefinition } = await loadPermissions({
      customRoles: [
        {
          permissions: ["tools:use"],
          toolPermissions: { mode: "category", allowed: ["image", "video"] },
        },
      ],
    });
    const actor = makeUser({ role: "av", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "category",
      allowed: ["image"],
    });
    expect(ok).toBe(true);
  });

  it("same-mode category containment fails when target has a category the actor lacks", async () => {
    const { canGrantRoleDefinition } = await loadPermissions({
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    const actor = makeUser({ role: "imager", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "category",
      allowed: ["image", "video"],
    });
    expect(ok).toBe(false);
  });

  it("rejects the grant when the actor lacks a requested base permission", async () => {
    // Actor holds only tools:use; requesting users:manage must be rejected.
    const { canGrantRoleDefinition } = await loadPermissions({
      customRoles: [
        { permissions: ["tools:use"], toolPermissions: { mode: "category", allowed: ["image"] } },
      ],
    });
    const actor = makeUser({ role: "imager", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use", "users:manage"], {
      mode: "category",
      allowed: ["image"],
    });
    expect(ok).toBe(false);
  });

  it("rejects an invalid toolPermissions shape up front (before any role lookup)", async () => {
    const { canGrantRoleDefinition } = await loadPermissions();
    const actor = makeUser({ role: "admin", id: "a1" });
    const ok = await canGrantRoleDefinition(actor, ["tools:use"], {
      mode: "bogus",
      allowed: ["image"],
    } as never);
    expect(ok).toBe(false);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("an unrestricted (null tool-scope) actor contains any target tool-scope", async () => {
    // Built-in admin actor has toolPermissions null => isToolScopeContained
    // short-circuits true, and admin holds every base permission.
    const { canGrantRoleDefinition } = await loadPermissions({ perToolEnforced: true });
    const admin = makeUser({ role: "admin", id: "root" });
    const ok = await canGrantRoleDefinition(admin, ["tools:use"], {
      mode: "tool",
      allowed: ["resize", "convert-video"],
    });
    expect(ok).toBe(true);
    // Admin resolves from ROLE_PERMISSIONS, so no DB lookup.
    expect(selectMock).not.toHaveBeenCalled();
  });
});

// ── canAssignRole: actor admin, custom target ────────────────────────

describe("canAssignRole for custom target roles (admin actor)", () => {
  it("admin can assign a custom role whose permissions are a subset of admin's", async () => {
    const { canAssignRole } = await loadPermissions({
      customRoles: [{ permissions: ["tools:use", "files:own"], toolPermissions: null }],
    });
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canAssignRole(admin, "editor-lite")).toBe(true);
  });

  it("returns false when the custom target role has zero permissions", async () => {
    const { canAssignRole } = await loadPermissions({
      customRoles: [{ permissions: [], toolPermissions: null }],
    });
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canAssignRole(admin, "empty-role")).toBe(false);
  });

  it("returns false when the target role does not exist", async () => {
    const { canAssignRole } = await loadPermissions();
    selectMock.mockReturnValueOnce(selectChain([]));
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canAssignRole(admin, "ghost-role")).toBe(false);
  });

  it("returns false when the target role is disabled (no lookup)", async () => {
    const { canAssignRole } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canAssignRole(admin, "disabled:editor")).toBe(false);
    expect(selectMock).not.toHaveBeenCalled();
  });
});

// ── canManageTargetRole authority matrix ─────────────────────────────

describe("canManageTargetRole authority matrix", () => {
  it("admin can manage the built-in user role", async () => {
    const { canManageTargetRole } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canManageTargetRole(admin, "user")).toBe(true);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("editor cannot manage the admin role (higher authority level)", async () => {
    const { canManageTargetRole } = await loadPermissions();
    const editor = makeUser({ role: "editor", id: "e1" });
    expect(await canManageTargetRole(editor, "admin")).toBe(false);
  });

  it("a disabled actor can manage nothing", async () => {
    const { canManageTargetRole } = await loadPermissions();
    const disabled = makeUser({ role: "disabled:admin", id: "d1" });
    expect(await canManageTargetRole(disabled, "user")).toBe(false);
  });

  it("normalizes a bare 'disabled' target to admin so non-admins fail closed", async () => {
    // normalizeManagedRole turns "disabled" into "admin"; an editor cannot
    // manage admin authority.
    const { canManageTargetRole } = await loadPermissions();
    const editor = makeUser({ role: "editor", id: "e1" });
    expect(await canManageTargetRole(editor, "disabled")).toBe(false);
  });

  it("normalizes a nested disabled marker back to its inner role", async () => {
    // "disabled:disabled:user" strips to "user"; admin can manage user.
    const { canManageTargetRole } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canManageTargetRole(admin, "disabled:disabled:user")).toBe(true);
  });

  it("returns false when the normalized target role cannot be resolved", async () => {
    const { canManageTargetRole } = await loadPermissions();
    selectMock.mockReturnValueOnce(selectChain([]));
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await canManageTargetRole(admin, "phantom")).toBe(false);
  });
});

// ── API-key scoped actor authority ───────────────────────────────────

describe("scoped-key actor authority", () => {
  it("an admin key scoped below the target cannot grant that permission", async () => {
    // Admin actor, but the API key omits users:manage. The target custom role
    // requires users:manage, so the scoped effective set fails to contain it.
    const { canAssignRole } = await loadPermissions({
      customRoles: [{ permissions: ["tools:use", "users:manage"], toolPermissions: null }],
    });
    const scopedAdmin = makeUser({
      role: "admin",
      id: "root",
      apiKeyPermissions: ["tools:use", "files:own"],
    });
    expect(await canAssignRole(scopedAdmin, "manager")).toBe(false);
  });

  it("an admin key scoped to include the target permissions can grant it", async () => {
    const { canAssignRole } = await loadPermissions({
      customRoles: [{ permissions: ["tools:use", "files:own"], toolPermissions: null }],
    });
    const scopedAdmin = makeUser({
      role: "admin",
      id: "root",
      apiKeyPermissions: ["tools:use", "files:own", "files:all"],
    });
    expect(await canAssignRole(scopedAdmin, "editor-lite")).toBe(true);
  });
});

// ── isFullEffectiveAdmin ─────────────────────────────────────────────

describe("isFullEffectiveAdmin", () => {
  it("is false for a non-admin role", async () => {
    const { isFullEffectiveAdmin } = await loadPermissions();
    const editor = makeUser({ role: "editor", id: "e1" });
    expect(await isFullEffectiveAdmin(editor)).toBe(false);
  });

  it("is true for an unscoped admin", async () => {
    const { isFullEffectiveAdmin } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    expect(await isFullEffectiveAdmin(admin)).toBe(true);
  });

  it("is false for an admin whose API key drops any admin permission", async () => {
    const { isFullEffectiveAdmin } = await loadPermissions();
    const scopedAdmin = makeUser({
      role: "admin",
      id: "root",
      apiKeyPermissions: ["tools:use"],
    });
    expect(await isFullEffectiveAdmin(scopedAdmin)).toBe(false);
  });

  it("is true for an admin whose API key still carries the full admin set", async () => {
    const { isFullEffectiveAdmin } = await loadPermissions();
    const fullScoped = makeUser({
      role: "admin",
      id: "root",
      apiKeyPermissions: [...ALL_ADMIN_PERMISSIONS],
    });
    expect(await isFullEffectiveAdmin(fullScoped)).toBe(true);
  });
});

// ── requireFullAdmin guard ───────────────────────────────────────────

describe("requireFullAdmin", () => {
  it("sends 401 when no authenticated user", async () => {
    const { requireFullAdmin } = await loadPermissions();
    getAuthUserMock.mockReturnValue(null);
    const { reply, sent } = makeMockReply();
    const result = await requireFullAdmin({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ error: "Authentication required", code: "AUTH_REQUIRED" });
  });

  it("sends 403 when the user is not a full effective admin", async () => {
    const { requireFullAdmin } = await loadPermissions();
    getAuthUserMock.mockReturnValue(makeUser({ role: "editor", id: "e1" }));
    const { reply, sent } = makeMockReply();
    const result = await requireFullAdmin({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({
      error: "Full administrator authority required",
      code: "ESCALATION_DENIED",
    });
  });

  it("returns the user for a full effective admin", async () => {
    const { requireFullAdmin } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    getAuthUserMock.mockReturnValue(admin);
    const { reply } = makeMockReply();
    const result = await requireFullAdmin({} as never, reply as never);
    expect(result).toEqual(admin);
  });
});

// ── requirePermission guard (success + failure paths) ────────────────

describe("requirePermission guard", () => {
  it("sends 401 when no authenticated user", async () => {
    const { requirePermission } = await loadPermissions();
    getAuthUserMock.mockReturnValue(null);
    const { reply, sent } = makeMockReply();
    const result = await requirePermission("tools:use")({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ error: "Authentication required", code: "AUTH_REQUIRED" });
  });

  it("sends 403 when the user lacks the permission", async () => {
    const { requirePermission } = await loadPermissions();
    getAuthUserMock.mockReturnValue(makeUser({ role: "user", id: "u1" }));
    const { reply, sent } = makeMockReply();
    const result = await requirePermission("users:manage")({} as never, reply as never);
    expect(result).toBeNull();
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({ error: "Insufficient permissions", code: "FORBIDDEN" });
  });

  it("returns the user when the permission is held", async () => {
    const { requirePermission } = await loadPermissions();
    const admin = makeUser({ role: "admin", id: "root" });
    getAuthUserMock.mockReturnValue(admin);
    const { reply } = makeMockReply();
    const result = await requirePermission("users:manage")({} as never, reply as never);
    expect(result).toEqual(admin);
  });
});

// ── requireToolAccess guard ──────────────────────────────────────────

describe("requireToolAccess guard", () => {
  it("sends 401 when no authenticated user", async () => {
    const { requireToolAccess } = await loadPermissions();
    getAuthUserMock.mockReturnValue(null);
    const { reply, sent } = makeMockReply();
    const result = await requireToolAccess({} as never, reply as never, "resize");
    expect(result).toBeNull();
    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ error: "Authentication required", code: "AUTH_REQUIRED" });
  });

  it("sends 403 when the user cannot use the tool (lacks tools:use)", async () => {
    // API key scope omits tools:use, so hasEffectiveToolAccess short-circuits false.
    const { requireToolAccess } = await loadPermissions();
    getAuthUserMock.mockReturnValue(
      makeUser({ role: "admin", id: "root", apiKeyPermissions: ["files:own"] }),
    );
    const { reply, sent } = makeMockReply();
    const result = await requireToolAccess({} as never, reply as never, "resize");
    expect(result).toBeNull();
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({ error: "You don't have permission to use this tool" });
  });

  it("returns the user when tool access is granted", async () => {
    const { requireToolAccess } = await loadPermissions();
    const user = makeUser({ role: "user", id: "u1" });
    getAuthUserMock.mockReturnValue(user);
    const { reply } = makeMockReply();
    const result = await requireToolAccess({} as never, reply as never, "resize");
    expect(result).toEqual(user);
  });
});
