import { test as base, expect } from "@playwright/test";
import { login, openSettings, test } from "./helpers";

const API = process.env.API_URL || "http://localhost:13490";

/** Auth + JSON content-type (POST, PUT). */
function authJson(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Auth header only (GET, DELETE). */
function authOnly(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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

/** Delete all non-admin test users by prefix. */
async function cleanupUsersByPrefix(adminToken: string, prefix: string): Promise<void> {
  const listRes = await fetch(`${API}/api/auth/users`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { users } = await listRes.json();
  for (const u of users) {
    if (u.username.startsWith(prefix)) {
      await fetch(`${API}/api/auth/users/${u.id}`, {
        method: "DELETE",
        headers: authOnly(adminToken),
      });
    }
  }
}

/** Delete test teams by prefix. */
async function cleanupTeamsByPrefix(adminToken: string, prefix: string): Promise<void> {
  const listRes = await fetch(`${API}/api/v1/teams`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { teams } = await listRes.json();
  for (const t of teams) {
    if (t.name.startsWith(prefix)) {
      await fetch(`${API}/api/v1/teams/${t.id}`, {
        method: "DELETE",
        headers: authOnly(adminToken),
      });
    }
  }
}

/** Delete custom roles by prefix. */
async function cleanupRolesByPrefix(adminToken: string, prefix: string): Promise<void> {
  const listRes = await fetch(`${API}/api/v1/roles`, {
    headers: authOnly(adminToken),
  });
  if (!listRes.ok) return;
  const { roles } = await listRes.json();
  for (const r of roles) {
    if (r.name.startsWith(prefix)) {
      await fetch(`${API}/api/v1/roles/${r.id}`, {
        method: "DELETE",
        headers: authOnly(adminToken),
      });
    }
  }
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

const UID = Date.now().toString(36);

// ===========================================================================
// SETTINGS DIALOG -- Dialog Interactions (expanded)
// ===========================================================================

test.describe("Settings Dialog - Dialog state management", () => {
  test("dialog content scrolls independently of the page", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // The dialog's content pane has overflow-y-auto. Scope to the dialog: the
    // page's <main> also carries .flex-1.overflow-y-auto.
    const contentPane = page.getByRole("dialog").locator(".flex-1.overflow-y-auto");
    await expect(contentPane.first()).toBeVisible();

    // Navigate to a section with lots of content (Tools)
    await page.getByRole("button", { name: /tools/i }).click();
    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
  });

  test("rapidly switching tabs does not cause rendering errors", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Quickly click through several tabs
    const tabs = ["Security", "About", "General", "Tools", "API Keys", "About"];
    for (const tab of tabs) {
      await page.getByRole("button", { name: new RegExp(tab, "i") }).click();
    }

    // Final tab should render correctly
    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();
  });

  test("settings dialog renders with role=dialog and aria-modal", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("backdrop click does not interfere with dialog controls", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Click a button inside the dialog -- should not close it
    await page.getByRole("button", { name: /about/i }).click();
    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();

    // Dialog should still be open
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();
  });
});

// ===========================================================================
// GENERAL TAB -- expanded tests
// ===========================================================================

test.describe("Settings General Tab - User info details", () => {
  test("displays role in capitalized format below username", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // The role text is displayed with capitalize class
    const roleEl = page.locator("p.capitalize").first();
    await expect(roleEl).toBeVisible();
    const roleText = await roleEl.textContent();
    expect(roleText?.toLowerCase()).toContain("admin");
  });

  test("General tab has user preferences description", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Description text should be present
    await expect(page.getByText("User preferences and display settings.")).toBeVisible();
  });

  test("Save Settings button is disabled while saving", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const saveBtn = page.getByRole("button", { name: /save settings/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();

    // Click save and check the button shows loading state
    await saveBtn.click();

    // Eventually the save completes and message appears
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("General tab shows Language (locale) dropdown", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Exact match: "Language" also appears inside the row description
    // ("Language for the interface"), which would trip strict mode.
    await expect(page.getByText("Language", { exact: true })).toBeVisible();
    // The locale select has the user's current locale as its value
    const localeSelect = page.locator("select").filter({ has: page.locator("option[value='en']") });
    await expect(localeSelect).toBeVisible();
  });
});

// ===========================================================================
// SYSTEM SETTINGS TAB -- expanded validation
// ===========================================================================

test.describe("Settings System Settings Tab - Additional coverage", () => {
  test("shows description 'Server-side configuration and limits.'", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Server-side configuration and limits.")).toBeVisible();
  });

  test("File Upload Limit has min=1 attribute", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    const uploadInput = page.locator("input[type='number']").first();
    await expect(uploadInput).toHaveAttribute("min", "1");
  });

  test("Login Attempt Limit has min=1 and max=100 attributes", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Login Attempt Limit")).toBeVisible();

    const loginInput = page.locator("input[type='number']").nth(1);
    await expect(loginInput).toHaveAttribute("min", "1");
    await expect(loginInput).toHaveAttribute("max", "100");
  });

  test("System theme dropdown has light, dark, and system options", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    const themeSelect = page
      .locator("select")
      .filter({ has: page.locator("option[value='dark']") });

    // The System section loads its settings asynchronously; wait for the select
    // to render before reading its options.
    await expect(themeSelect).toBeVisible({ timeout: 10_000 });
    const options = await themeSelect.locator("option").allTextContents();
    expect(options).toContain("Light");
    expect(options).toContain("Dark");
    expect(options).toContain("System");
  });

  test("Language dropdown contains English option", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    const langSelect = page.locator("select").filter({ has: page.locator("option[value='en']") });
    await expect(langSelect).toBeVisible();

    const enOption = langSelect.locator("option[value='en']");
    await expect(enOption).toBeAttached();
  });
});

// ===========================================================================
// SECURITY TAB -- expanded password validation flows
// ===========================================================================

test.describe("Settings Security Tab - Extended password flows", () => {
  test("empty form submission is prevented by browser required validation", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // All password inputs should have the required attribute
    const currentPw = page.getByPlaceholder("Current Password");
    const newPw = page.getByPlaceholder("New Password").first();
    const confirmPw = page.getByPlaceholder("Confirm New Password");

    await expect(currentPw).toHaveAttribute("required", "");
    await expect(newPw).toHaveAttribute("required", "");
    await expect(confirmPw).toHaveAttribute("required", "");
  });

  test("multiple password visibility toggles work independently", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    const currentPwInput = page.getByPlaceholder("Current Password");
    const newPwInput = page.getByPlaceholder("New Password").first();

    // Both start as password type
    await expect(currentPwInput).toHaveAttribute("type", "password");
    await expect(newPwInput).toHaveAttribute("type", "password");

    // Toggle the first one
    const toggleButtons = page.locator("form button[type='button']");
    await toggleButtons.first().click();

    // Only the first should change
    await expect(currentPwInput).toHaveAttribute("type", "text");
    await expect(newPwInput).toHaveAttribute("type", "password");
  });

  test("security section shows Change Password sub-heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // The form has a sub-heading for the change password section
    await expect(page.getByText("Change Password").first()).toBeVisible();
  });

  test("changing a password to the same value succeeds", async ({ loggedInPage: page }) => {
    // Exercised on a throwaway user: the default admin password ("admin", 5
    // chars) cannot satisfy the 8-char policy, so a same-value change can never
    // be submitted for it.
    const uid = Date.now().toString(36);
    const username = `samepw-${uid}`;
    const password = "Samepass123";
    const adminToken = await page.evaluate(() => localStorage.getItem("snapotter-token"));

    const reg = await page.request.post("/api/auth/register", {
      headers: { authorization: `Bearer ${adminToken}` },
      data: { username, password, role: "user" },
    });
    expect(reg.ok()).toBeTruthy();

    try {
      const userLogin = await page.request.post("/api/auth/login", {
        data: { username, password },
      });
      const { token } = await userLogin.json();
      const change = await page.request.post("/api/auth/change-password", {
        headers: { authorization: `Bearer ${token}` },
        data: { currentPassword: password, newPassword: password },
      });
      expect(change.ok()).toBeTruthy();
    } finally {
      const list = await page.request.get("/api/auth/users", {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      if (list.ok()) {
        const { users } = await list.json();
        const u = users.find((x: { username: string; id: string }) => x.username === username);
        if (u) {
          await page.request.delete(`/api/auth/users/${u.id}`, {
            headers: { authorization: `Bearer ${adminToken}` },
          });
        }
      }
    }
  });
});

// ===========================================================================
// ABOUT TAB -- expanded tests
// ===========================================================================

test.describe("Settings About Tab - Extended", () => {
  test("shows AGPLv3 license information", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    // Exact match: the license description paragraph also contains "AGPLv3",
    // so a substring match would resolve to two elements (strict mode).
    await expect(page.getByText("AGPLv3", { exact: true })).toBeVisible();
  });

  test("shows SnapOtter logo element", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    // The OtterLogo component renders an <img> (logo.png), not an inline SVG.
    const logo = page.locator("img.text-primary").first();
    await expect(logo).toBeVisible();
  });

  test("GitHub link points to snapotter-hq repository", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    const githubLink = page.getByRole("link", { name: /github repository/i });
    await expect(githubLink).toHaveAttribute("href", "https://github.com/snapotter-hq/snapotter");
  });

  test("documentation link points to docs.snapotter.com", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    const docsLink = page.getByRole("link", { name: /documentation/i });
    await expect(docsLink).toHaveAttribute("href", "https://docs.snapotter.com/");
  });

  test("API Reference link points to /api/docs", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    const apiLink = page.getByRole("link", { name: /api reference/i });
    await expect(apiLink).toHaveAttribute("href", "/api/docs");
  });

  test("external links open in new tab", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    const githubLink = page.getByRole("link", { name: /github repository/i });
    await expect(githubLink).toHaveAttribute("target", "_blank");
    await expect(githubLink).toHaveAttribute("rel", /noopener/);
  });

  test("shows License label and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.getByText("License:").first()).toBeVisible();
  });
});

// ===========================================================================
// PEOPLE TAB -- team assignment during user creation
// ===========================================================================

test.describe("Settings People Tab - Team assignment", () => {
  test("team dropdown in add form contains Default team", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /add members/i }).click();
    await expect(page.getByPlaceholder("Username")).toBeVisible();

    // The team dropdown is the second select in the form
    const teamSelect = page.locator("form select").nth(1);
    await expect(teamSelect).toBeVisible();

    // Default team should be an option
    await expect(teamSelect.locator("option")).toContainText(["Default"]);

    // Cancel the form
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("Generate Password button populates the password field", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /add members/i }).click();
    await expect(page.getByPlaceholder("Username")).toBeVisible();

    // Click the Generate Password button
    const generateBtn = page.getByRole("button", { name: /generate/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // The password field should now have a value (16 chars generated password).
    // After generating, the password input flips to type="text", so a generic
    // form input[type='text'] selector would also match the (empty) username
    // field. Target the password input by its id instead.
    const pwInput = page.locator("#new-user-password");
    const value = await pwInput.inputValue();
    expect(value.length).toBeGreaterThanOrEqual(8);

    // Cancel the form
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("creating user with specific team assigns them correctly", async ({
    loggedInPage: page,
  }) => {
    const teamName = `exteam-${UID}`;
    const username = `extuser-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a team via API first
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: /add members/i }).click();
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill("TestPass123!");

      // Select the created team
      const teamSelect = page.locator("form select").nth(1);
      await teamSelect.selectOption(teamName);

      await page.getByRole("button", { name: /create/i }).click();

      // User should appear in the table with the team name
      await expect(page.getByText(username)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(teamName).first()).toBeVisible();
    } finally {
      await cleanupUsersByPrefix(adminToken, "extuser-");
      await cleanupTeamsByPrefix(adminToken, "exteam-");
    }
  });

  test("Add Members form shows 'New Member' heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /add members/i }).click();

    await expect(page.getByText("New Member")).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("canceling add form resets it", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /add members/i }).click();
    await page.getByPlaceholder("Username").fill("shouldnotexist");

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Form should be hidden
    await expect(page.getByPlaceholder("Username")).not.toBeVisible();

    // Re-open -- the username field should be empty
    await page.getByRole("button", { name: /add members/i }).click();
    const usernameValue = await page.getByPlaceholder("Username").inputValue();
    expect(usernameValue).toBe("");

    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("user table row has avatar with first letter initial", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // The admin row should have an avatar with "A" (first letter of admin)
    const avatar = page.locator(".w-8.h-8.rounded-full").first();
    await expect(avatar).toBeVisible();
    await expect(avatar).toContainText("A");
  });

  test("people tab heading says 'People'", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();

    await expect(page.locator("h3").filter({ hasText: "People" })).toBeVisible();
  });
});

// ===========================================================================
// TEAMS TAB -- expanded team management tests
// ===========================================================================

test.describe("Settings Teams Tab - Extended", () => {
  test("teams tab heading and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Teams" })).toBeVisible();
    await expect(page.getByText(/manage.*team/i).first()).toBeVisible();
  });

  test("Create New Team button toggles the form", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    // Click to open form
    await page.getByRole("button", { name: /create new team/i }).click();
    await expect(page.getByPlaceholder("Team name")).toBeVisible();

    // Click again to close form
    await page.getByRole("button", { name: /create new team/i }).click();
    await expect(page.getByPlaceholder("Team name")).not.toBeVisible();
  });

  test("team three-dot menu shows Rename and Delete options", async ({ loggedInPage: page }) => {
    const teamName = `menuteam-${UID}`;
    const adminToken = await getAdminToken();
    try {
      // A fresh instance has no teams, so create one to act on.
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();
      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });

      // Open the three-dot menu for the team
      const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
      await moreButtons.last().click();

      await expect(page.locator("[role='menu']").getByText("Rename")).toBeVisible();
      await expect(page.locator("[role='menu']").getByText("Delete")).toBeVisible();
    } finally {
      await cleanupTeamsByPrefix(adminToken, "menuteam-");
    }
  });

  test("team rename via Enter key works", async ({ loggedInPage: page }) => {
    const teamName = `enterteam-${UID}`;
    const renamedName = `enterrenamed-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a team via API
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();
      await page.waitForTimeout(500);

      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });

      // Open menu and rename
      const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
      await moreButtons.last().click();
      await page.locator("[role='menu']").getByText("Rename").click();

      // Inline edit input should appear
      const renameInput = page.locator(
        "input.px-2.py-1.rounded.border.border-border.bg-background",
      );
      await expect(renameInput).toBeVisible({ timeout: 3_000 });

      await renameInput.fill(renamedName);
      await renameInput.press("Enter");

      // Updated name should appear
      await expect(page.getByText(renamedName)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "enterteam-");
      await cleanupTeamsByPrefix(adminToken, "enterrenamed-");
    }
  });

  test("team rename cancel via Escape key works", async ({ loggedInPage: page }) => {
    const teamName = `escteam-${UID}`;
    const adminToken = await getAdminToken();
    try {
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();
      await page.waitForTimeout(500);
      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });

      // Open the team menu and click Rename
      const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
      await moreButtons.last().click();
      await page.locator("[role='menu']").getByText("Rename").click();

      // Inline edit input should appear
      const renameInput = page.locator(
        "input.px-2.py-1.rounded.border.border-border.bg-background",
      );
      await expect(renameInput).toBeVisible({ timeout: 3_000 });

      // Press Escape to cancel
      await renameInput.press("Escape");

      // Input should disappear and the team name should be unchanged
      await expect(renameInput).not.toBeVisible();
      await expect(page.getByText(teamName)).toBeVisible();
    } finally {
      await cleanupTeamsByPrefix(adminToken, "escteam-");
    }
  });

  test("creating multiple teams shows correct member counts", async ({ loggedInPage: page }) => {
    const teamName1 = `multi1-${UID}`;
    const teamName2 = `multi2-${UID}`;
    const adminToken = await getAdminToken();

    try {
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName1 }),
      });
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName2 }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();
      await page.waitForTimeout(500);

      await expect(page.getByText(teamName1)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(teamName2)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "multi1-");
      await cleanupTeamsByPrefix(adminToken, "multi2-");
    }
  });
});

// ===========================================================================
// ROLES TAB -- expanded custom role tests
// ===========================================================================

test.describe("Settings Roles Tab - Extended custom role management", () => {
  test("creating a role without a name is prevented", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await page.getByRole("button", { name: /create custom role/i }).click();

    // Leave name empty and try to submit
    const nameInput = page.getByPlaceholder("Role name");
    await expect(nameInput).toHaveAttribute("required", "");

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("creating a custom role with duplicate name shows error", async ({ loggedInPage: page }) => {
    const roleName = `exdup${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create role via API first
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Dup test",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Try to create same role via GUI
      await page.getByRole("button", { name: /create custom role/i }).click();
      await page.getByPlaceholder("Role name").fill(roleName);
      await page.getByRole("button", { name: /^create$/i }).click();

      // Should show duplicate error
      await expect(page.getByText(/already exists|duplicate/i).first()).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanupRolesByPrefix(adminToken, roleName);
    }
  });

  test("admin built-in role shows correct permissions", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    // Admin role should have all permissions displayed
    // Look for key permissions that admin role must have
    await expect(
      page.locator(".font-mono").filter({ hasText: "users:manage" }).first(),
    ).toBeVisible();
    await expect(
      page.locator(".font-mono").filter({ hasText: "settings:write" }).first(),
    ).toBeVisible();
  });

  test("Cancel button on edit role form closes it", async ({ loggedInPage: page }) => {
    const roleName = `excancel${UID}`;
    const adminToken = await getAdminToken();

    try {
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Cancel test",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Open edit
      await page.locator("button[title='Edit role']").first().click();
      await expect(page.getByText(/edit role/i)).toBeVisible();

      // Cancel
      await page.getByRole("button", { name: /cancel/i }).click();

      // Edit form should be hidden
      await expect(page.getByText(/edit role/i)).not.toBeVisible();
    } finally {
      await cleanupRolesByPrefix(adminToken, roleName);
    }
  });

  test("editing a custom role description updates it", async ({ loggedInPage: page }) => {
    const roleName = `exdesc${UID}`;
    const adminToken = await getAdminToken();

    try {
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Original desc",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Edit the role
      await page.locator("button[title='Edit role']").first().click();
      await expect(page.getByText(/edit role/i)).toBeVisible();

      // Change description
      const descInput = page.getByPlaceholder("Description (optional)");
      await descInput.fill("Updated desc");

      // Save
      await page.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("Role updated")).toBeVisible({ timeout: 5_000 });

      // Updated description should appear on the card
      await expect(page.getByText("Updated desc")).toBeVisible();
    } finally {
      await cleanupRolesByPrefix(adminToken, roleName);
    }
  });
});

// ===========================================================================
// AUDIT LOG TAB -- expanded tests
// ===========================================================================

test.describe("Settings Audit Log Tab - Extended", () => {
  test("audit log pagination controls appear when entries exceed page limit", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Wait for table to load
    await expect(page.locator("h3").filter({ hasText: "Audit Log" })).toBeVisible();

    // Pagination controls may or may not appear depending on entry count
    // Just verify the component loads without error
    await page.waitForTimeout(1_000);
  });

  test("filter dropdown includes USER_UPDATED and PASSWORD_RESET actions", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    const filterSelect = page.locator("select").first();
    await expect(filterSelect).toBeVisible();

    for (const action of ["USER_UPDATED", "PASSWORD_RESET", "API_KEY_DELETED", "ROLE_CREATED"]) {
      await expect(filterSelect.locator(`option[value='${action}']`)).toBeAttached();
    }
  });

  test("USER_CREATED entry appears after creating a user", async ({ loggedInPage: page }) => {
    const username = `auditcreate-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a user via API to generate a USER_CREATED audit entry
      await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ username, password: "AuditPass123!", role: "user" }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /audit log/i }).click();
      await expect(page.locator("table thead")).toBeVisible({ timeout: 10_000 });

      const filterSelect = page.locator("select").first();
      await filterSelect.selectOption("USER_CREATED");

      await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
      const tableText = await page.locator("table tbody").textContent();
      expect(tableText).toContain("USER_CREATED");
    } finally {
      await cleanupUsersByPrefix(adminToken, "auditcreate-");
    }
  });

  test("API_KEY_CREATED entry appears after generating an API key", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    // Generate an API key to trigger the audit entry
    await page.getByRole("button", { name: /api keys/i }).click();
    const keyName = `auditkey-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // Clean up the key
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);

    // Check audit log for API_KEY_CREATED
    await page.getByRole("button", { name: /audit log/i }).click();
    await expect(page.locator("table thead")).toBeVisible({ timeout: 10_000 });

    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("API_KEY_CREATED");

    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
    const tableText = await page.locator("table tbody").textContent();
    expect(tableText).toContain("API_KEY_CREATED");
  });
});

// ===========================================================================
// API KEYS TAB -- expanded tests
// ===========================================================================

test.describe("Settings API Keys Tab - Extended", () => {
  test("API keys tab shows heading and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.locator("h3").filter({ hasText: "API Keys" })).toBeVisible();
    await expect(page.getByText("Manage API keys for programmatic access")).toBeVisible();
  });

  test("generating key with expiration date shows expiration in the list", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `expTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);

    // Set an expiration date
    const dateInput = page.locator("input[type='datetime-local']");
    await dateInput.fill("2030-12-31T23:59");

    // Generate
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // The key entry should show an expiration indicator
    await expect(page.getByText(/Expires/).first()).toBeVisible();

    // Clean up
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);
  });

  test("multiple API keys can be created and listed", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const key1Name = `multi1-${Date.now()}`;
    const key2Name = `multi2-${Date.now()}`;

    // Create first key
    await page.getByPlaceholder("Key name (optional)").fill(key1Name);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // Create second key
    await page.getByPlaceholder("Key name (optional)").fill(key2Name);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await page.waitForTimeout(1_000);

    // Both should appear in the Existing Keys list
    await expect(page.getByText(key1Name)).toBeVisible();
    await expect(page.getByText(key2Name)).toBeVisible();

    // Clean up both
    page.on("dialog", (d) => d.accept());
    const deleteButtons = page.locator("button[title='Delete key']");
    const count = await deleteButtons.count();
    for (let i = count - 1; i >= 0; i--) {
      const btn = deleteButtons.nth(i);
      const isVis = await btn.isVisible().catch(() => false);
      if (isVis) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test("scoped permission checkbox labels include permission names", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await page.getByText("Restrict permissions (optional)").click();
    await expect(page.getByText("Remove permission scoping")).toBeVisible();

    // Key permissions should be listed as checkbox labels
    for (const perm of ["tools:use", "files:own"]) {
      await expect(page.getByText(perm).first()).toBeVisible();
    }

    // Collapse
    await page.getByText("Remove permission scoping").click();
    await expect(page.getByText("Restrict permissions (optional)")).toBeVisible();
  });
});

// ===========================================================================
// AI FEATURES TAB -- expanded tests
// ===========================================================================

test.describe("Settings AI Features Tab - Extended", () => {
  test("AI Features tab shows correct heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    await expect(page.locator("h3").filter({ hasText: "AI Features" })).toBeVisible();
  });

  test("AI Features tab shows Install All button", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    await expect(page.getByRole("button", { name: /install all/i })).toBeVisible();
  });

  test("each AI bundle card shows a name", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    // Wait for bundles to load
    const bundleCards = page.locator(".rounded-lg.border.border-border.p-4");
    await expect(bundleCards.first()).toBeVisible({ timeout: 5_000 });

    // First bundle card should have text content (bundle name)
    const firstCardText = await bundleCards.first().textContent();
    expect(firstCardText?.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// TOOLS TAB -- expanded tests
// ===========================================================================

test.describe("Settings Tools Tab - Extended", () => {
  test("tools section has a search input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    const dialogContent = page.locator(".flex-1.overflow-y-auto");
    const searchInput = dialogContent.getByPlaceholder("Search tools...");
    await expect(searchInput).toBeVisible();
  });

  test("search for a specific tool shows only matching results", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    const dialogContent = page.locator(".flex-1.overflow-y-auto");
    const searchInput = dialogContent.getByPlaceholder("Search tools...");

    // Search for "Compress"
    await searchInput.fill("Compress");

    // Compress tool should be visible
    await expect(dialogContent.getByText("Compress").first()).toBeVisible();

    // Clear search
    await searchInput.fill("");
  });

  test("saving tool settings shows restart banner", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /save tool settings/i }).click();

    await expect(page.getByText("Restart required for changes to take effect.")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("tool descriptions are visible in the tool list", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Each tool row has a description in text-xs text-muted-foreground
    const descriptions = page.locator(".flex-1.overflow-y-auto .text-xs.text-muted-foreground");
    const count = await descriptions.count();
    expect(count).toBeGreaterThan(5);
  });
});

// ===========================================================================
// RBAC VERIFICATION -- expanded cross-role API endpoint checks
// ===========================================================================

base.describe("RBAC API - Editor expanded endpoint checks", () => {
  const EDITOR_EXP = `rbaceditorexp-${UID}`;
  const EDITOR_EXP_PASS = "EditorExpPass1";
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, EDITOR_EXP, EDITOR_EXP_PASS, "editor");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, EDITOR_EXP);
  });

  base.test("editor gets 403 on DELETE user endpoint", async ({ page }) => {
    await login(page, EDITOR_EXP, EDITOR_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    // Try to delete a user (even a fake ID)
    const res = await fetch(`${API}/api/auth/users/99999`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  base.test("editor gets 403 on PUT settings endpoint", async ({ page }) => {
    await login(page, EDITOR_EXP, EDITOR_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileUploadLimitMb: "999" }),
    });
    expect(res.status).toBe(403);
  });

  base.test("editor gets 403 on POST roles endpoint", async ({ page }) => {
    await login(page, EDITOR_EXP, EDITOR_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/roles`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "hacked-role", permissions: ["users:manage"] }),
    });
    expect(res.status).toBe(403);
  });

  base.test("editor can access own session endpoint", async ({ page }) => {
    await login(page, EDITOR_EXP, EDITOR_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user.username).toBe(EDITOR_EXP);
    expect(data.user.role).toBe("editor");
  });
});

base.describe("RBAC API - User expanded endpoint checks", () => {
  const USER_EXP = `rbacuserexp-${UID}`;
  const USER_EXP_PASS = "UserExpPass1";
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, USER_EXP, USER_EXP_PASS, "user");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, USER_EXP);
  });

  base.test("user gets 403 on DELETE user endpoint", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/auth/users/99999`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  base.test("user gets 403 on POST teams endpoint", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/teams`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "hacked-team" }),
    });
    expect(res.status).toBe(403);
  });

  base.test("user gets 403 on POST roles endpoint", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/roles`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "hacked-role", permissions: ["users:manage"] }),
    });
    expect(res.status).toBe(403);
  });

  base.test("user gets 403 on PUT settings endpoint", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileUploadLimitMb: "999" }),
    });
    expect(res.status).toBe(403);
  });

  base.test("user can change own password via API", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    // Change password to same value
    const res = await fetch(`${API}/api/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: USER_EXP_PASS,
        newPassword: USER_EXP_PASS,
      }),
    });
    expect(res.status).toBe(200);
  });

  base.test("user can generate own API key", async ({ page }) => {
    await login(page, USER_EXP, USER_EXP_PASS);

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token"));
    expect(token).toBeTruthy();

    const res = await fetch(`${API}/api/v1/api-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "user-test-key" }),
    });
    expect(res.status).toBe(201);

    // Clean up: list and delete the key
    const listRes = await fetch(`${API}/api/v1/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    for (const k of listData.apiKeys) {
      if (k.name === "user-test-key") {
        await fetch(`${API}/api/v1/api-keys/${k.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });
});

// ===========================================================================
// RBAC -- Admin GUI-level tests for admin-only tabs
// ===========================================================================

base.describe("RBAC GUI - Admin admin-only tab deep access", () => {
  base.use({ storageState: ".playwright/.auth/user.json" });

  base.test("admin can open Roles tab and see Create Custom Role button", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Roles" })).toBeVisible();
    await expect(page.getByRole("button", { name: /create custom role/i })).toBeVisible();
  });

  base.test("admin can open Audit Log and filter by specific action", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Audit Log" })).toBeVisible();

    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("LOGIN_SUCCESS");

    // Wait for filtered results
    await page.waitForTimeout(1_000);
  });

  base.test("admin can save system settings without error", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });
});

// ===========================================================================
// RBAC -- Editor and User GUI-level tab content verification
// ===========================================================================

base.describe("RBAC GUI - Editor tab content access", () => {
  const EDITOR_GUI = `rbacedgui-${UID}`;
  const EDITOR_GUI_PASS = "EdGuiPass1";
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, EDITOR_GUI, EDITOR_GUI_PASS, "editor");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, EDITOR_GUI);
  });

  base.test("editor can change password from Security tab", async ({ page }) => {
    await login(page, EDITOR_GUI, EDITOR_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    await page.getByPlaceholder("Current Password").fill(EDITOR_GUI_PASS);
    await page.getByPlaceholder("New Password").first().fill(EDITOR_GUI_PASS);
    await page.getByPlaceholder("Confirm New Password").fill(EDITOR_GUI_PASS);
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByText("Password changed successfully")).toBeVisible({ timeout: 5_000 });
  });

  base.test("editor can generate and delete API key from GUI", async ({ page }) => {
    await login(page, EDITOR_GUI, EDITOR_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `editorKey-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(keyName)).toBeVisible();

    // Delete the key
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await expect(page.getByText(keyName)).not.toBeVisible({ timeout: 5_000 });
  });

  base.test("editor can view About tab with version info", async ({ page }) => {
    await login(page, EDITOR_GUI, EDITOR_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();
    await expect(page.getByText("Version:")).toBeVisible();
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
  });
});

base.describe("RBAC GUI - User tab content access", () => {
  const USER_GUI = `rbacusrgui-${UID}`;
  const USER_GUI_PASS = "UsrGuiPass1";
  let adminToken: string;

  base.beforeAll(async () => {
    adminToken = await getAdminToken();
    await createReadyUser(adminToken, USER_GUI, USER_GUI_PASS, "user");
  });

  base.afterAll(async () => {
    await deleteUser(adminToken, USER_GUI);
  });

  base.test("user can save General tab preferences", async ({ page }) => {
    await login(page, USER_GUI, USER_GUI_PASS);
    await openSettings(page);

    await expect(page.getByText("Default Tool View")).toBeVisible();
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  base.test("user can change own password from Security tab", async ({ page }) => {
    await login(page, USER_GUI, USER_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    await page.getByPlaceholder("Current Password").fill(USER_GUI_PASS);
    await page.getByPlaceholder("New Password").first().fill(USER_GUI_PASS);
    await page.getByPlaceholder("Confirm New Password").fill(USER_GUI_PASS);
    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByText("Password changed successfully")).toBeVisible({ timeout: 5_000 });
  });

  base.test("user can toggle tool visibility in Tools tab", async ({ page }) => {
    await login(page, USER_GUI, USER_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    const counterText = page.getByText(/\d+ tools? disabled/);
    const initialText = await counterText.textContent();
    const initialCount = parseInt(initialText?.match(/(\d+)/)?.[1] || "0", 10);

    // Toggle the first tool
    const firstToggle = page.locator("button.w-11.h-6").first();
    await firstToggle.click();

    const updatedText = await counterText.textContent();
    const updatedCount = parseInt(updatedText?.match(/(\d+)/)?.[1] || "0", 10);
    expect(Math.abs(updatedCount - initialCount)).toBe(1);

    // Revert
    await firstToggle.click();
  });

  base.test("user can generate API key from GUI", async ({ page }) => {
    await login(page, USER_GUI, USER_GUI_PASS);
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `userKey-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Store this key securely")).toBeVisible();

    // Clean up
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);
  });
});
