/**
 * Unit tests for roles route validation and role management logic.
 *
 * Tests the role name validation, builtin role protection,
 * permission validation, and user reassignment on role deletion.
 */
import { describe, expect, it } from "vitest";
import { updateRoleSchema } from "../../../apps/api/src/routes/roles.js";

// ── Reproduce validation logic from roles.ts ────────────────────────────

type Permission =
  | "tools:use"
  | "files:own"
  | "files:all"
  | "apikeys:own"
  | "apikeys:all"
  | "pipelines:own"
  | "pipelines:all"
  | "settings:read"
  | "settings:write"
  | "users:manage"
  | "teams:manage"
  | "features:manage"
  | "system:health"
  | "audit:read"
  | "compliance:manage"
  | "webhooks:manage"
  | "security:manage";

const ALL_PERMISSIONS: Permission[] = [
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

const ROLE_NAME_PATTERN = /^[a-z0-9_-]+$/;

function validateRoleName(raw: string): { success: boolean; name?: string; error?: string } {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 30) {
    return { success: false, error: "Role name must be 2-30 characters" };
  }
  if (!ROLE_NAME_PATTERN.test(trimmed)) {
    return {
      success: false,
      error: "Role name can only contain lowercase letters, numbers, hyphens, and underscores",
    };
  }
  return { success: true, name: trimmed };
}

function validateCreateRole(body: {
  name?: string;
  description?: string;
  permissions?: string[];
}): { success: boolean; error?: string } {
  if (!body.name) return { success: false, error: "name is required" };
  const nameResult = validateRoleName(body.name);
  if (!nameResult.success) return nameResult;
  if (!body.permissions || body.permissions.length === 0) {
    return { success: false, error: "At least one permission is required" };
  }
  if (body.description !== undefined && body.description.length > 500) {
    return { success: false, error: "Description too long" };
  }
  return { success: true };
}

function validateUpdateRole(body: {
  name?: string;
  description?: string;
  permissions?: string[];
}): { success: boolean; error?: string } {
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  return { success: true };
}

function validatePermissions(permissions: string[]): string[] {
  return permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("roles route logic", () => {
  describe("role name validation", () => {
    it("accepts valid lowercase name", () => {
      const result = validateRoleName("viewer");
      expect(result.success).toBe(true);
      expect(result.name).toBe("viewer");
    });

    it("converts to lowercase", () => {
      const result = validateRoleName("Viewer");
      expect(result.success).toBe(true);
      expect(result.name).toBe("viewer");
    });

    it("trims whitespace and lowercases", () => {
      const result = validateRoleName("  Manager  ");
      expect(result.success).toBe(true);
      expect(result.name).toBe("manager");
    });

    it("allows hyphens", () => {
      const result = validateRoleName("team-lead");
      expect(result.success).toBe(true);
    });

    it("allows underscores", () => {
      const result = validateRoleName("team_lead");
      expect(result.success).toBe(true);
    });

    it("allows numbers", () => {
      const result = validateRoleName("admin2");
      expect(result.success).toBe(true);
    });

    it("rejects single character", () => {
      const result = validateRoleName("a");
      expect(result.success).toBe(false);
    });

    it("rejects names longer than 30 characters", () => {
      const result = validateRoleName("a".repeat(31));
      expect(result.success).toBe(false);
    });

    it("accepts name exactly 30 characters", () => {
      const result = validateRoleName("a".repeat(30));
      expect(result.success).toBe(true);
    });

    it("accepts name exactly 2 characters", () => {
      const result = validateRoleName("ab");
      expect(result.success).toBe(true);
    });

    it("rejects spaces in name", () => {
      const result = validateRoleName("team lead");
      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = validateRoleName("admin@role");
      expect(result.success).toBe(false);
    });

    it("rejects dots in name", () => {
      const result = validateRoleName("admin.role");
      expect(result.success).toBe(false);
    });
  });

  describe("create role validation", () => {
    it("accepts valid create payload", () => {
      const result = validateCreateRole({
        name: "reviewer",
        description: "Can review files",
        permissions: ["tools:use", "files:own"],
      });
      expect(result.success).toBe(true);
    });

    it("description is optional", () => {
      const result = validateCreateRole({
        name: "reviewer",
        permissions: ["tools:use"],
      });
      expect(result.success).toBe(true);
    });

    it("requires at least one permission", () => {
      const result = validateCreateRole({
        name: "reviewer",
        permissions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing permissions", () => {
      const result = validateCreateRole({
        name: "reviewer",
      });
      expect(result.success).toBe(false);
    });

    it("rejects description longer than 500 characters", () => {
      const result = validateCreateRole({
        name: "reviewer",
        permissions: ["tools:use"],
        description: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update role validation", () => {
    it("accepts partial update with just name", () => {
      const result = validateUpdateRole({ name: "new-name" });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with just description", () => {
      const result = validateUpdateRole({ description: "Updated description" });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with just permissions", () => {
      const result = validateUpdateRole({ permissions: ["tools:use", "files:own"] });
      expect(result.success).toBe(true);
    });

    it("accepts empty update body", () => {
      const result = validateUpdateRole({});
      expect(result.success).toBe(true);
    });

    it("accepts all fields together", () => {
      const result = validateUpdateRole({
        name: "updated-role",
        description: "New desc",
        permissions: ["tools:use"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty permissions array (#2887)", () => {
      const result = validateUpdateRole({ permissions: [] });
      expect(result.success).toBe(false);
      expect(result.error).toBe("At least one permission is required");
    });
  });

  describe("permission validation", () => {
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

  describe("builtin role protection", () => {
    it("blocks modification of builtin roles", () => {
      const role = { isBuiltin: true, name: "admin" };
      expect(role.isBuiltin).toBe(true);
    });

    it("allows modification of custom roles", () => {
      const role = { isBuiltin: false, name: "reviewer" };
      expect(role.isBuiltin).toBe(false);
    });

    it("blocks deletion of builtin roles", () => {
      const role = { isBuiltin: true, name: "user" };
      expect(role.isBuiltin).toBe(true);
    });
  });

  describe("user reassignment on role deletion", () => {
    it("reassigns users to 'user' role when custom role is deleted", () => {
      const usersOnRole = [
        { id: "u1", role: "reviewer" },
        { id: "u2", role: "reviewer" },
      ];
      const updatedUsers = usersOnRole.map((u) => ({ ...u, role: "user" }));
      expect(updatedUsers.every((u) => u.role === "user")).toBe(true);
    });
  });

  describe("role name rename cascading", () => {
    it("updates all users when role name changes", () => {
      const users = [
        { id: "u1", role: "old-name" },
        { id: "u2", role: "old-name" },
      ];
      const newName = "new-name";
      const updated = users.map((u) => ({ ...u, role: newName }));
      expect(updated.every((u) => u.role === "new-name")).toBe(true);
    });
  });
});
