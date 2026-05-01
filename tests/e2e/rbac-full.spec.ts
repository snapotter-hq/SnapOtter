import { test as base, expect } from "@playwright/test";
import { login, openSettings } from "./helpers";

const API = process.env.API_URL || "http://localhost:13490";

// Unique suffix to avoid collisions with parallel test runs
const UID = Date.now().toString(36);

/** Auth header only (GET, DELETE). */
function authOnly(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Auth + JSON content-type (POST, PUT). */
function authJson(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function getAdminToken(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const data = await res.json();
  return data.token;
}

/** Create a custom role via API. Returns the role id. */
async function createCustomRole(
  adminToken: string,
  name: string,
  permissions: string[],
  description = "",
): Promise<string> {
  const res = await fetch(`${API}/api/v1/roles`, {
    method: "POST",
    headers: authJson(adminToken),
    body: JSON.stringify({ name, permissions, description }),
  });
  if (res.status === 409) {
    // Role already exists — look it up
    const listRes = await fetch(`${API}/api/v1/roles`, {
      headers: authOnly(adminToken),
    });
    const { roles } = await listRes.json();
    const existing = roles.find((r: { name: string }) => r.name === name);
    return existing?.id ?? "";
  }
  if (!res.ok) throw new Error(`Failed to create role: ${res.status}`);
  const data = await res.json();
  return data.id;
}

/** Create a user with a given role and clear mustChangePassword. */
async function createUserWithRole(
  adminToken: string,
  username: string,
  password: string,
  role: string,
): Promise<void> {
  const createRes = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: authJson(adminToken),
    body: JSON.stringify({ username, password, role }),
  });
  if (createRes.status !== 201 && createRes.status !== 409) {
    throw new Error(`Failed to create user ${username}: ${createRes.status}`);
  }

  // Login as the user to get a token, then change password to clear mustChangePassword
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`Failed to login as ${username}: ${loginRes.status}`);
  const loginData = await loginRes.json();

  const changeRes = await fetch(`${API}/api/auth/change-password`, {
    method: "POST",
    headers: authJson(loginData.token),
    body: JSON.stringify({ currentPassword: password, newPassword: password }),
  });
  if (!changeRes.ok) {
    throw new Error(`Failed to clear mustChangePassword for ${username}: ${changeRes.status}`);
  }

  // Re-login (change-password invalidates sessions) and dismiss analytics consent
  const reLogin = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const reLoginData = await reLogin.json();
  await fetch(`${API}/api/v1/user/analytics`, {
    method: "PUT",
    headers: authJson(reLoginData.token),
    body: JSON.stringify({ enabled: false }),
  });
}

/** Delete a user by username if it exists. */
async function deleteUserByUsername(adminToken: string, username: string): Promise<void> {
  const listRes = await fetch(`${API}/api/auth/users`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { users } = await listRes.json();
  const found = users.find((u: { username: string }) => u.username === username);
  if (found) {
    await fetch(`${API}/api/auth/users/${found.id}`, {
      method: "DELETE",
      headers: authOnly(adminToken),
    });
  }
}

/** Delete a custom role by name if it exists. */
async function deleteRoleByName(adminToken: string, name: string): Promise<void> {
  const listRes = await fetch(`${API}/api/v1/roles`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { roles } = await listRes.json();
  const found = roles.find((r: { name: string; isBuiltin: boolean }) => r.name === name);
  if (found && !found.isBuiltin) {
    await fetch(`${API}/api/v1/roles/${found.id}`, {
      method: "DELETE",
      headers: authOnly(adminToken),
    });
  }
}

// ── 1. People Management UI — role dropdown ─────────────────────────

base.describe("RBAC Full — People Management UI", () => {
  base.use({
    storageState: "test-results/.auth/user.json",
  });

  base.test(
    "admin sees role dropdown with admin/editor/user options when adding members",
    async ({ page }) => {
      await page.goto("/");
      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();

      // Click "Add Members" to reveal the form
      await page.getByRole("button", { name: /add members/i }).click();

      // The role select should be visible inside the add-user form
      const roleSelect = page.locator("form select").first();
      await expect(roleSelect).toBeVisible();

      // Verify the dropdown contains built-in role options (admin, editor, user)
      const options = roleSelect.locator("option");
      const optionTexts = await options.allTextContents();
      const lower = optionTexts.map((t) => t.toLowerCase());

      expect(lower.some((t) => t.includes("admin"))).toBe(true);
      expect(lower.some((t) => t.includes("editor"))).toBe(true);
      expect(lower.some((t) => t.includes("user"))).toBe(true);
    },
  );
});

// ── 2–3. Roles Management UI ────────────────────────────────────────

base.describe("RBAC Full — Roles Management UI", () => {
  base.use({
    storageState: "test-results/.auth/user.json",
  });

  base.test("admin sees Roles tab in settings", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);

    await expect(page.getByRole("button", { name: /^roles$/i })).toBeVisible();
  });

  base.test("roles section shows built-in roles with Built-in badge", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    // Wait for roles to load
    await expect(page.getByText("Manage roles and their permissions")).toBeVisible();

    // At least one "Built-in" badge should appear (admin, editor, user are built-in)
    const builtinBadges = page.getByText("Built-in");
    await expect(builtinBadges.first()).toBeVisible();

    // Verify at least the three default built-in roles are present
    await expect(page.getByText("admin").first()).toBeVisible();
    await expect(page.getByText("editor").first()).toBeVisible();
    await expect(page.getByText("user").first()).toBeVisible();
  });
});

// ── 4–5. Audit Log UI ──────────────────────────────────────────────

base.describe("RBAC Full — Audit Log UI", () => {
  base.use({
    storageState: "test-results/.auth/user.json",
  });

  base.test("admin sees Audit Log tab in settings", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);

    await expect(page.getByRole("button", { name: /audit log/i })).toBeVisible();
  });

  base.test("audit log displays LOGIN_SUCCESS entries", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Wait for audit log section to load
    await expect(page.locator("h3").filter({ hasText: "Audit Log" })).toBeVisible();

    // The admin login from auth.setup should have created at least one LOGIN_SUCCESS entry.
    // Filter by LOGIN_SUCCESS action using the dropdown.
    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("LOGIN_SUCCESS");

    // Wait for table to update — check for at least one row with "LOGIN SUCCESS" text
    // The action column displays the action with underscores replaced by spaces
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });

    // Verify the table contains LOGIN_SUCCESS (displayed as "LOGIN SUCCESS" or "LOGIN_SUCCESS")
    const tableText = await page.locator("table tbody").textContent();
    expect(tableText).toContain("LOGIN");
  });
});

// ── 6. API Key Scoping UI ──────────────────────────────────────────

base.describe("RBAC Full — API Key Scoping UI", () => {
  base.use({
    storageState: "test-results/.auth/user.json",
  });

  base.test("API Keys section has permission scoping toggle", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // The scoping toggle text should be visible
    const scopingToggle = page.getByText("Restrict permissions (optional)");
    await expect(scopingToggle).toBeVisible();

    // Click the toggle to expand the permission scoping checkboxes
    await scopingToggle.click();

    // After expanding, the "Remove permission scoping" text should appear
    await expect(page.getByText("Remove permission scoping")).toBeVisible();

    // Permission checkboxes should appear (e.g., tools:use, files:own)
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    await expect(page.getByText("tools:use")).toBeVisible();
  });
});

// ── 7–8. Custom Role User ──────────────────────────────────────────

base.describe("RBAC Full — Custom Role User", () => {
  const CUSTOM_ROLE = `testrole-${UID}`;
  const CUSTOM_USER = `customuser-${UID}`;
  const CUSTOM_PASSWORD = "CustomPass1";
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();

    // Create a custom role with only settings:read and tools:use permissions
    await createCustomRole(
      adminToken,
      CUSTOM_ROLE,
      ["settings:read", "tools:use"],
      "E2E test role",
    );

    // Create a user with that custom role
    await createUserWithRole(adminToken, CUSTOM_USER, CUSTOM_PASSWORD, CUSTOM_ROLE);
  });

  base.afterAll(async () => {
    // Clean up: delete user first, then role
    await deleteUserByUsername(adminToken, CUSTOM_USER);
    await deleteRoleByName(adminToken, CUSTOM_ROLE);
  });

  base.test("custom role user only sees permitted tabs (no admin tabs)", async ({ page }) => {
    await login(page, CUSTOM_USER, CUSTOM_PASSWORD);

    await openSettings(page);

    // Should see these tabs (available to all authenticated users or matching permissions)
    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /about/i })).toBeVisible();

    // Should NOT see admin-only tabs (requires users:manage, teams:manage, etc.)
    await expect(page.getByRole("button", { name: /system settings/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /people/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /teams/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^roles$/i })).not.toBeVisible();
  });

  base.test(
    "custom role user gets correct API permissions (settings:read OK, settings:write 403)",
    async ({ page }) => {
      await login(page, CUSTOM_USER, CUSTOM_PASSWORD);

      // Extract token from localStorage
      const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
      expect(token).toBeTruthy();
      const bearerToken = token as string;

      // GET /api/v1/settings — requires auth only, should succeed
      const readRes = await fetch(`${API}/api/v1/settings`, {
        headers: authOnly(bearerToken),
      });
      expect(readRes.status).toBe(200);

      // PUT /api/v1/settings — requires settings:write, should be 403
      const writeRes = await fetch(`${API}/api/v1/settings`, {
        method: "PUT",
        headers: authJson(bearerToken),
        body: JSON.stringify({ appName: "hacked" }),
      });
      expect(writeRes.status).toBe(403);

      // GET /api/auth/users — requires users:manage, should be 403
      const usersRes = await fetch(`${API}/api/auth/users`, {
        headers: authOnly(bearerToken),
      });
      expect(usersRes.status).toBe(403);
    },
  );
});
