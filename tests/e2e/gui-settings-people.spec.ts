import { expect, openSettings, test } from "./helpers";

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

// ---------------------------------------------------------------------------
// Settings Dialog -- People tab (user CRUD), Teams, and Roles
// ---------------------------------------------------------------------------

const UID = Date.now().toString(36);

test.describe("GUI Settings - People Tab", () => {
  test("displays user count and user table", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();

    // User count
    await expect(page.getByText(/\d+ users?/)).toBeVisible({ timeout: 5_000 });

    // Table headers
    await expect(page.getByText("User").first()).toBeVisible();
    await expect(page.getByText("Role").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();

    // Admin user row
    await expect(page.getByText("admin").first()).toBeVisible();
  });

  test("search filters users and shows empty state", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    const searchInput = page.getByPlaceholder("Search members...");
    await searchInput.fill("zzzznonexistent");
    await expect(page.getByText("No members match your search.")).toBeVisible();

    // Clear search restores admin
    await searchInput.fill("");
    await expect(page.getByText("admin").first()).toBeVisible();
  });

  test("Add Members opens form with username, password, role, team fields", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    const addBtn = page.getByRole("button", { name: /add members/i });
    await expect(addBtn).toBeVisible();

    const isDisabled = await addBtn.isDisabled();
    if (!isDisabled) {
      await addBtn.click();

      await expect(page.getByPlaceholder("Username")).toBeVisible();
      await expect(page.getByPlaceholder("Password")).toBeVisible();
      // Role and team dropdowns (two <select> elements inside the form)
      const selects = page.locator("form select");
      await expect(selects.first()).toBeVisible();
      await expect(selects.nth(1)).toBeVisible();
      // Form action buttons
      await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    }
  });

  test("creating a user via the form adds them to the table", async ({ loggedInPage: page }) => {
    const username = `guipeople-${UID}`;
    let adminToken: string;

    try {
      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: /add members/i }).click();
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill("TestPass123!");
      await page.getByRole("button", { name: /create/i }).click();

      // User should appear in the table
      await expect(page.getByText(username)).toBeVisible({ timeout: 5_000 });
    } finally {
      // Clean up via API
      adminToken = await getAdminToken();
      await cleanupUsersByPrefix(adminToken, "guipeople-");
    }
  });

  test("duplicate username shows error", async ({ loggedInPage: page }) => {
    const username = `guidup-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create user via API first
      await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
      });

      // Try to create same username via GUI
      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: /add members/i }).click();
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill("TestPass123!");
      await page.getByRole("button", { name: /create/i }).click();

      // Should show an error (409 conflict mapped to user-facing message)
      await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupUsersByPrefix(adminToken, "guidup-");
    }
  });

  test("three-dot menu shows Edit Role/Team, Reset Password, and Delete", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Open the actions menu on the first user row
    await page.getByTitle("Actions").first().click();

    await expect(page.getByText("Edit Role / Team")).toBeVisible();
    await expect(page.getByText("Reset Password")).toBeVisible();
    await expect(page.getByText("Delete User")).toBeVisible();
  });

  test("cannot delete yourself via the menu", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // The admin row should have an Actions button
    await page.getByTitle("Actions").first().click();

    // Accept the confirm dialog
    page.on("dialog", (d) => d.accept());
    await page.getByText("Delete User").click();

    // Should show an error message since admin cannot delete themselves
    await expect(page.getByText(/failed to delete|cannot/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("deleting a non-admin user removes them from the table", async ({ loggedInPage: page }) => {
    const username = `guidelete-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create user via API first
      await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      // Verify the user appears
      await expect(page.getByText(username)).toBeVisible({ timeout: 5_000 });

      // Open the actions menu for the test user (last Actions button)
      await page.getByTitle("Actions").last().click();

      // Accept the confirm dialog and click Delete User
      page.on("dialog", (d) => d.accept());
      await page.getByText("Delete User").click();

      // User should be removed from the list
      await expect(page.getByText(username)).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupUsersByPrefix(adminToken, "guidelete-");
    }
  });

  test("cannot demote your own admin role via Edit Role / Team", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // The admin row should have an Actions button
    await page.getByTitle("Actions").first().click();
    await page.getByText("Edit Role / Team").click();

    // The edit form should appear with current role
    await expect(page.getByText(/edit admin/i)).toBeVisible();

    // Change admin role to user
    const roleSelect = page.locator("form select").first();
    await roleSelect.selectOption("user");

    // Click Save
    await page.getByRole("button", { name: /^save$/i }).click();

    // Should show an error about not being able to remove own admin role
    await expect(page.getByText(/cannot remove your own admin role|failed/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Reset Password opens the reset form for a user", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Open the actions menu on the first user row
    await page.getByTitle("Actions").first().click();
    await page.getByText("Reset Password").click();

    // The reset form should appear
    await expect(page.getByText(/reset password for/i)).toBeVisible();
    await expect(page.getByPlaceholder(/new password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /reset password/i })).toBeVisible();

    // Cancel closes the form
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText(/reset password for/i)).not.toBeVisible();
  });
});

test.describe("GUI Settings - Teams Tab", () => {
  test("displays team list with Default team", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Teams" })).toBeVisible();
    // Default team should exist
    await expect(page.getByText("Default").first()).toBeVisible();
    // Table headers
    await expect(page.getByText("Team Name")).toBeVisible();
    await expect(page.getByText("Members").first()).toBeVisible();
  });

  test("Create New Team button opens form and creates a team", async ({ loggedInPage: page }) => {
    const teamName = `guiteam-${UID}`;
    const adminToken = await getAdminToken();

    try {
      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();

      await page.getByRole("button", { name: /create new team/i }).click();
      await expect(page.getByPlaceholder("Team name")).toBeVisible();

      await page.getByPlaceholder("Team name").fill(teamName);
      await page.getByRole("button", { name: /^create$/i }).click();

      // Team should appear in the list
      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "guiteam-");
    }
  });

  test("deleting a team removes it from the list", async ({ loggedInPage: page }) => {
    const teamName = `guidelteam-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a team via API first
      await fetch(`${API}/api/v1/teams`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({ name: teamName }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /teams/i }).click();
      await page.waitForTimeout(500);

      // Verify the team exists
      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });

      // Open the three-dot menu for the test team row (last MoreVertical button)
      const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
      await moreButtons.last().click();

      // Click Delete in the dropdown and accept the confirm dialog
      page.on("dialog", (d) => d.accept());
      await page.locator("[role='menu']").getByText("Delete").click();

      // Team should no longer be visible
      await expect(page.getByText(teamName)).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "guidelteam-");
    }
  });
});

test.describe("GUI Settings - Roles Tab", () => {
  test("displays built-in roles with Built-in badge", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Roles" })).toBeVisible();
    await expect(page.getByText("Manage roles and their permissions")).toBeVisible();

    // Built-in badge should exist
    await expect(page.getByText("Built-in").first()).toBeVisible();

    // All three built-in roles should be present
    await expect(page.getByText("admin").first()).toBeVisible();
    await expect(page.getByText("editor").first()).toBeVisible();
    await expect(page.getByText("user").first()).toBeVisible();
  });

  test("built-in roles do not show edit or delete buttons", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await expect(page.getByText("Built-in").first()).toBeVisible();

    // Built-in role cards should not have edit/delete buttons
    // The code only renders edit/delete for !role.isBuiltin
    // Check that the first role card (a built-in one) has no "Edit role" or "Delete role" buttons
    const builtinCard = page
      .locator("div")
      .filter({ has: page.getByText("Built-in") })
      .first();
    await expect(builtinCard.locator("button[title='Edit role']")).not.toBeVisible();
    await expect(builtinCard.locator("button[title='Delete role']")).not.toBeVisible();
  });

  test("Create Custom Role button is visible", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await expect(page.getByRole("button", { name: /create custom role/i })).toBeVisible();
  });
});
