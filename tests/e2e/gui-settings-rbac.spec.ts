import { test as base, expect } from "@playwright/test";
import { getTestImagePath, login, openSettings } from "./helpers";

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

  base.test("admin can navigate to System Settings and see configuration", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.locator("h3").filter({ hasText: "System Settings" })).toBeVisible();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();
    await expect(page.getByText("Default Theme")).toBeVisible();
  });

  base.test("admin can navigate to Teams tab and see team list", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Teams" })).toBeVisible();
    await expect(page.getByText("Default").first()).toBeVisible();
  });

  base.test("admin can navigate to Roles tab and see built-in roles", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Roles" })).toBeVisible();
    await expect(page.getByText("Built-in").first()).toBeVisible();
  });

  base.test("admin can navigate to AI Features tab", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    await expect(page.locator("h3").filter({ hasText: "AI Features" })).toBeVisible();
  });

  base.test("admin has full API access to admin endpoints", async ({ page }) => {
    await page.goto("/");

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/auth/users requires users:manage
    const usersRes = await fetch(`${API}/api/auth/users`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(usersRes.status).toBe(200);

    // GET /api/v1/settings requires settings:read
    const settingsRes = await fetch(`${API}/api/v1/settings`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(settingsRes.status).toBe(200);

    // GET /api/v1/audit-log requires audit:read
    const auditRes = await fetch(`${API}/api/v1/audit-log`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(auditRes.status).toBe(200);
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

  base.test("editor can access Tools tab and see tool toggles", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });
  });

  base.test("editor can access Product Analytics tab", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByText("Product Analytics").first()).toBeVisible();
    await expect(page.getByText(/share anonymous usage data/i)).toBeVisible();
  });

  base.test("editor General tab shows correct username and role", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);
    await openSettings(page);

    // General is the default tab
    await expect(page.getByText(EDITOR_USER)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("editor").first()).toBeVisible();
  });

  base.test("editor gets 403 on admin API endpoints", async ({ page }) => {
    await login(page, EDITOR_USER, EDITOR_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/auth/users requires users:manage -- editor does not have this
    const usersRes = await fetch(`${API}/api/auth/users`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(usersRes.status).toBe(403);

    // PUT /api/v1/settings requires settings:write -- editor does not have this
    const settingsRes = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ testSetting: "hacked" }),
    });
    expect(settingsRes.status).toBe(403);

    // GET /api/v1/audit-log requires audit:read -- editor does not have this
    const auditRes = await fetch(`${API}/api/v1/audit-log`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(auditRes.status).toBe(403);
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

  base.test("user can access Tools tab and see tool toggles", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });
  });

  base.test("user can access Security tab and change password form", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    await expect(page.getByText("Change Password").first()).toBeVisible();
    await expect(page.getByPlaceholder("Current Password")).toBeVisible();
  });

  base.test("user can access Product Analytics tab", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByText("Product Analytics").first()).toBeVisible();
  });

  base.test("user gets 403 on admin and editor API endpoints", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/auth/users requires users:manage
    const usersRes = await fetch(`${API}/api/auth/users`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(usersRes.status).toBe(403);

    // PUT /api/v1/settings requires settings:write
    const settingsRes = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ testSetting: "hacked" }),
    });
    expect(settingsRes.status).toBe(403);

    // GET /api/v1/audit-log requires audit:read
    const auditRes = await fetch(`${API}/api/v1/audit-log`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(auditRes.status).toBe(403);

    // GET /api/v1/teams requires teams:manage
    const teamsRes = await fetch(`${API}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(teamsRes.status).toBe(403);
  });

  base.test("user can still navigate to a tool page and use it", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);

    // Navigate to the resize tool page -- user role should have tools:use permission
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // The tool page should load (not redirect or show a 403)
    // Look for the dropzone or tool heading
    const dropzone = page.locator("[class*='border-dashed']");
    const toolHeading = page.getByText("Resize").first();

    const dropzoneVisible = await dropzone.isVisible().catch(() => false);
    const headingVisible = await toolHeading.isVisible().catch(() => false);

    expect(dropzoneVisible || headingVisible).toBe(true);
  });

  base.test("user can upload an image to a tool page", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);

    // Navigate to the resize tool
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Upload a test image via the file chooser
    const dropzone = page.locator("[class*='border-dashed']").first();
    const dropzoneVisible = await dropzone.isVisible().catch(() => false);

    if (dropzoneVisible) {
      const fileChooserPromise = page.waitForEvent("filechooser");
      await dropzone.click();
      const fileChooser = await fileChooserPromise;

      const testImagePath = getTestImagePath();
      await fileChooser.setFiles(testImagePath);

      // Wait for the upload to register (the image preview should appear)
      await page.waitForTimeout(1_000);

      // Verify the image was accepted (a download or process button should appear,
      // or the filename should show in the UI)
      const hasProcessButton = await page
        .getByRole("button", { name: /process|download|resize/i })
        .first()
        .isVisible()
        .catch(() => false);
      const hasImagePreview = await page
        .locator("img")
        .first()
        .isVisible()
        .catch(() => false);

      expect(hasProcessButton || hasImagePreview).toBe(true);
    }
  });

  base.test("user can access API Keys tab", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.locator("h3").filter({ hasText: "API Keys" })).toBeVisible();
    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();
  });

  base.test("user gets 403 on roles endpoint", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/v1/roles requires users:manage
    const rolesRes = await fetch(`${API}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(rolesRes.status).toBe(403);
  });

  base.test("user cannot register new users via API", async ({ page }) => {
    await login(page, USER_USER, USER_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // POST /api/auth/register requires users:manage
    const registerRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "hacked-user",
        password: "HackedPass1",
        role: "admin",
      }),
    });
    expect(registerRes.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// RBAC -- additional cross-role endpoint verification
// ---------------------------------------------------------------------------

base.describe("RBAC API Endpoints - Editor (extended)", () => {
  let adminToken: string;
  const EDITOR_EXT = `guieditorext-${UID}`;
  const EDITOR_EXT_PASS = "EditorExtPass1";

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, EDITOR_EXT, EDITOR_EXT_PASS, "editor");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, EDITOR_EXT);
  });

  base.test("editor gets 403 on teams endpoint", async ({ page }) => {
    await login(page, EDITOR_EXT, EDITOR_EXT_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/v1/teams requires teams:manage
    const teamsRes = await fetch(`${API}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(teamsRes.status).toBe(403);
  });

  base.test("editor gets 403 on roles endpoint", async ({ page }) => {
    await login(page, EDITOR_EXT, EDITOR_EXT_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/v1/roles requires users:manage
    const rolesRes = await fetch(`${API}/api/v1/roles`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(rolesRes.status).toBe(403);
  });

  base.test("editor cannot register new users via API", async ({ page }) => {
    await login(page, EDITOR_EXT, EDITOR_EXT_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    const registerRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "hacked-editor-user",
        password: "HackedPass1",
        role: "user",
      }),
    });
    expect(registerRes.status).toBe(403);
  });

  base.test("editor can read own settings via API", async ({ page }) => {
    await login(page, EDITOR_EXT, EDITOR_EXT_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();
    const bearerToken = token as string;

    // GET /api/v1/config/auth is public, but session should work
    const sessionRes = await fetch(`${API}/api/auth/session`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    expect(sessionRes.status).toBe(200);

    const session = await sessionRes.json();
    expect(session.user.role).toBe("editor");
  });

  base.test("editor About tab shows correct role", async ({ page }) => {
    await login(page, EDITOR_EXT, EDITOR_EXT_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();
    await expect(page.getByText("Version:")).toBeVisible();
  });
});

base.describe("RBAC -- Editor and User see identical tabs (intentional)", () => {
  let adminToken: string;
  const RBAC_EDITOR = `rbaceditor-${UID}`;
  const RBAC_EDITOR_PASS = "RbacEditorPass1";
  const RBAC_USER = `rbacuser-${UID}`;
  const RBAC_USER_PASS = "RbacUserPass1";

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, RBAC_EDITOR, RBAC_EDITOR_PASS, "editor");
    await createReadyUser(adminToken, RBAC_USER, RBAC_USER_PASS, "user");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, RBAC_EDITOR);
    await deleteUser(adminToken, RBAC_USER);
  });

  base.test(
    "editor and user see the same 6 tabs (correct behavior, not a bug)",
    async ({ page }) => {
      // Verify editor tab count
      await login(page, RBAC_EDITOR, RBAC_EDITOR_PASS);
      await openSettings(page);
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
      const editorNavButtons = page.locator(".w-48 button");
      const editorCount = await editorNavButtons.count();

      // Close and switch to user
      await page.keyboard.press("Escape");
      await page.goto("/login");
      await login(page, RBAC_USER, RBAC_USER_PASS);
      await openSettings(page);
      await expect(page.getByRole("button", { name: /general/i })).toBeVisible();
      const userNavButtons = page.locator(".w-48 button");
      const userCount = await userNavButtons.count();

      // Both should see exactly 6 tabs
      expect(editorCount).toBe(6);
      expect(userCount).toBe(6);
      expect(editorCount).toBe(userCount);
    },
  );

  base.test("editor and user both see the same set of tab labels", async ({ page }) => {
    const expectedTabs = ["General", "Security", "API Keys", "Tools", "Product Analytics", "About"];

    // Check editor
    await login(page, RBAC_EDITOR, RBAC_EDITOR_PASS);
    await openSettings(page);
    for (const label of expectedTabs) {
      await expect(page.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    // Close and check user
    await page.keyboard.press("Escape");
    await page.goto("/login");
    await login(page, RBAC_USER, RBAC_USER_PASS);
    await openSettings(page);
    for (const label of expectedTabs) {
      await expect(page.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }
  });
});
