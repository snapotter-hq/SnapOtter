import { test as base, expect } from "@playwright/test";
import { login } from "./helpers";

const API = process.env.API_URL || "http://localhost:13490";

const TEST_USER = "rbactest";
const TEST_PASSWORD = "RbacTest1";

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
 * Create the test user with role "user" and clear the mustChangePassword flag
 * so the browser login redirects to "/" instead of "/change-password".
 */
async function ensureTestUser(adminToken: string): Promise<void> {
  // Create - ignore 409 if already exists
  const createRes = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: authJson(adminToken),
    body: JSON.stringify({
      username: TEST_USER,
      password: TEST_PASSWORD,
      role: "user",
    }),
  });
  if (createRes.status !== 201 && createRes.status !== 409) {
    throw new Error(`Failed to create test user: ${createRes.status}`);
  }

  // Login as the test user to get a token
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(`Failed to login as test user: ${loginRes.status}`);
  }
  const loginData = await loginRes.json();

  // Change password (same value) to clear mustChangePassword flag
  const changeRes = await fetch(`${API}/api/auth/change-password`, {
    method: "POST",
    headers: authJson(loginData.token),
    body: JSON.stringify({
      currentPassword: TEST_PASSWORD,
      newPassword: TEST_PASSWORD,
    }),
  });
  if (!changeRes.ok) {
    throw new Error(`Failed to clear mustChangePassword: ${changeRes.status}`);
  }

  // Re-login (change-password invalidates sessions) and dismiss analytics consent
  const reLogin = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASSWORD }),
  });
  const reLoginData = await reLogin.json();
  await fetch(`${API}/api/v1/user/analytics`, {
    method: "PUT",
    headers: authJson(reLoginData.token),
    body: JSON.stringify({ enabled: false }),
  });
}

/** Delete the test user if it exists. */
async function cleanupTestUser(adminToken: string): Promise<void> {
  const listRes = await fetch(`${API}/api/auth/users`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { users } = await listRes.json();
  const testUser = users.find((u: { username: string }) => u.username === TEST_USER);
  if (testUser) {
    await fetch(`${API}/api/auth/users/${testUser.id}`, {
      method: "DELETE",
      headers: authOnly(adminToken),
    });
  }
}

// ── Admin sees all tabs ─────────────────────────────────────────────

base.describe("RBAC - Admin sees all tabs", () => {
  base.use({
    storageState: "test-results/.auth/user.json",
  });

  base.test("admin sees all settings tabs", async ({ page }) => {
    await page.goto("/");
    await page.locator("aside").getByText("Settings").click();

    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /system settings/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /people/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /teams/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /about/i })).toBeVisible();
  });
});

// ── User sees restricted tabs ───────────────────────────────────────

base.describe("RBAC - User sees restricted tabs", () => {
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await ensureTestUser(adminToken);
  });

  base.afterAll(async () => {
    await cleanupTestUser(adminToken);
  });

  base.test("user role only sees permitted settings tabs", async ({ page }) => {
    await login(page, TEST_USER, TEST_PASSWORD);

    await page.locator("aside").getByText("Settings").click();

    // Should see these tabs
    await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /about/i })).toBeVisible();

    // Should NOT see admin-only tabs
    await expect(page.getByRole("button", { name: /system settings/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /people/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /teams/i })).not.toBeVisible();

    // Should NOT see editor-only tabs (requires settings:write)
    await expect(page.getByRole("button", { name: /ai features/i })).not.toBeVisible();
  });

  base.test("user role gets 403 on admin API endpoints", async ({ page }) => {
    await login(page, TEST_USER, TEST_PASSWORD);

    // Extract token from localStorage
    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/auth/users requires users:manage
    const usersRes = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(bearerToken),
    });
    expect(usersRes.status).toBe(403);

    // PUT /api/v1/settings requires settings:write
    const settingsRes = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: authJson(bearerToken),
      body: JSON.stringify({ appName: "hacked" }),
    });
    expect(settingsRes.status).toBe(403);
  });
});

// ── Editor sees collaborative tabs ─────────────────────────────────

base.describe("RBAC - Editor sees collaborative tabs", () => {
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    // Create editor user
    const createRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(adminToken),
      body: JSON.stringify({
        username: "editortest",
        password: "EditorTest1",
        role: "editor",
      }),
    });
    if (createRes.status !== 201 && createRes.status !== 409) {
      throw new Error(`Failed to create editor user: ${createRes.status}`);
    }

    // Clear mustChangePassword
    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "editortest", password: "EditorTest1" }),
    });
    if (!loginRes.ok) throw new Error(`Editor login failed: ${loginRes.status}`);
    const loginData = await loginRes.json();
    await fetch(`${API}/api/auth/change-password`, {
      method: "POST",
      headers: authJson(loginData.token),
      body: JSON.stringify({
        currentPassword: "EditorTest1",
        newPassword: "EditorTest1",
      }),
    });

    // Re-login and dismiss analytics consent
    const reLogin = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "editortest", password: "EditorTest1" }),
    });
    const reLoginData = await reLogin.json();
    await fetch(`${API}/api/v1/user/analytics`, {
      method: "PUT",
      headers: authJson(reLoginData.token),
      body: JSON.stringify({ enabled: false }),
    });
  });

  base.afterAll(async () => {
    const listRes = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(adminToken),
    });
    if (!listRes.ok) return;
    const { users } = await listRes.json();
    const editor = users.find((u: { username: string }) => u.username === "editortest");
    if (editor) {
      await fetch(`${API}/api/auth/users/${editor.id}`, {
        method: "DELETE",
        headers: authOnly(adminToken),
      });
    }
  });

  base.test(
    "editor sees general, security, api-keys, tools, about but not admin tabs",
    async ({ page }) => {
      await login(page, "editortest", "EditorTest1");
      await page.locator("aside").getByText("Settings").click();

      // Should see these
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /security/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /api keys/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /tools/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /about/i })).toBeVisible();

      // Should NOT see admin tabs
      await expect(page.getByRole("button", { name: /system settings/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /people/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /teams/i })).not.toBeVisible();
    },
  );

  base.test("editor gets 403 on admin API endpoints", async ({ page }) => {
    await login(page, "editortest", "EditorTest1");
    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const usersRes = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(token as string),
    });
    expect(usersRes.status).toBe(403);

    const settingsRes = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: authJson(token as string),
      body: JSON.stringify({ appName: "hacked" }),
    });
    expect(settingsRes.status).toBe(403);
  });
});
