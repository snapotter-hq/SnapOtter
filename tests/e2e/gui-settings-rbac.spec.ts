import { test as base, expect } from "@playwright/test";
import { login, openSettings } from "./helpers";

const API = process.env.API_URL || "http://localhost:13490";

const UID = Date.now().toString(36);
const EDITOR_USER = `guieditor-${UID}`;
const EDITOR_PASS = "EditorPass1";
const USER_USER = `guiuser-${UID}`;
const USER_PASS = "UserPass1";

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

/**
 * Create a user with a given role and clear mustChangePassword
 * so the browser login redirects to "/" instead of "/change-password".
 */
async function createReadyUser(
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

  // Login to get token, then change password to clear mustChangePassword
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`Login failed for ${username}: ${loginRes.status}`);
  const loginData = await loginRes.json();

  await fetch(`${API}/api/auth/change-password`, {
    method: "POST",
    headers: authJson(loginData.token),
    body: JSON.stringify({ currentPassword: password, newPassword: password }),
  });

  // Re-login and dismiss analytics consent
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
async function deleteUser(adminToken: string, username: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// RBAC role visibility verification for settings dialog tabs
// ---------------------------------------------------------------------------

// The NAV_ITEMS and their required permissions from the source:
//   general        - none
//   system         - settings:write
//   security       - none
//   people         - users:manage
//   teams          - teams:manage
//   roles          - users:manage
//   audit-log      - audit:read
//   api-keys       - none
//   ai-features    - settings:write
//   tools          - none
//   analytics      - none (Product Analytics)
//   about          - none

base.describe("RBAC Settings Visibility - Admin", () => {
  base.use({ storageState: ".playwright/.auth/user.json" });

  base.test("admin sees all settings tabs including admin-only ones", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);

    // Tabs visible to all roles
    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /product analytics/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /about/i })).toBeVisible();

    // Admin-only tabs (require settings:write, users:manage, teams:manage, audit:read)
    await expect(page.getByRole("button", { name: /system settings/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /people/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /teams/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^roles$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /audit log/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /ai features/i })).toBeVisible();
  });

  base.test("admin can navigate to People tab and see user table", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();

    await expect(page.getByText(/\d+ users?/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("admin").first()).toBeVisible();
  });

  base.test("admin can navigate to Audit Log tab and see entries", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Audit Log" })).toBeVisible();
    // Filter dropdown should be present
    await expect(
      page.locator("select").filter({ has: page.locator("option[value='']") }),
    ).toBeVisible();
  });

  base.test("admin sees all 12 nav items", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);

    // Count the navigation buttons in the settings dialog sidebar
    const navButtons = page.locator(".w-48 button");
    const count = await navButtons.count();
    expect(count).toBe(12);
  });
});

base.describe("RBAC Settings Visibility - Editor", () => {
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, EDITOR_USER, EDITOR_PASS, "editor");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, EDITOR_USER);
  });

  base.test(
    "editor sees general, security, api-keys, tools, analytics, about",
    async ({ page }) => {
      await login(page, EDITOR_USER, EDITOR_PASS);
      await openSettings(page);

      // Should see these tabs
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /product analytics/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /about/i })).toBeVisible();
    },
  );

  base.test(
    "editor does NOT see system settings, people, teams, roles, audit log, ai features",
    async ({ page }) => {
      await login(page, EDITOR_USER, EDITOR_PASS);
      await openSettings(page);

      // Wait for dialog to fully render
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();

      // Should NOT see admin-only tabs
      await expect(page.getByRole("button", { name: /system settings/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /people/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /teams/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^roles$/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /audit log/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /ai features/i })).not.toBeVisible();
    },
  );

  base.test("editor sees exactly 6 nav items", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);
    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();

    const navButtons = page.locator(".w-48 button");
    const count = await navButtons.count();
    expect(count).toBe(6);
  });

  base.test("editor can access Security tab and see change password form", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    await expect(page.getByText("Change Password").first()).toBeVisible();
    await expect(page.getByPlaceholder("Current Password")).toBeVisible();
  });

  base.test("editor can access API Keys tab and generate a key", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();
  });
});

base.describe("RBAC Settings Visibility - User", () => {
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, USER_USER, USER_PASS, "user");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, USER_USER);
  });

  base.test("user sees general, security, api-keys, tools, analytics, about", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);

    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /product analytics/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /about/i })).toBeVisible();
  });

  base.test(
    "user does NOT see system settings, people, teams, roles, audit log, ai features",
    async ({ page }) => {
      await login(page, USER_USER, USER_PASS);
      await openSettings(page);

      // Wait for dialog to fully render
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();

      await expect(page.getByRole("button", { name: /system settings/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /people/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /teams/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^roles$/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /audit log/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /ai features/i })).not.toBeVisible();
    },
  );

  base.test("user sees exactly 6 nav items", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();

    const navButtons = page.locator(".w-48 button");
    const count = await navButtons.count();
    expect(count).toBe(6);
  });

  base.test("user can access About tab and see version", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();
    await expect(page.getByText("Version:")).toBeVisible();
  });

  base.test("user General tab shows correct username and role", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);

    // General is the default tab; should show the user's username and role
    await expect(page.getByText(USER_USER)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("user").first()).toBeVisible();
  });
});
