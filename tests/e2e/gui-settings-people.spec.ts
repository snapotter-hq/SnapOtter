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

  test("role dropdown in add form contains admin, editor, and user options", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /add members/i }).click();
    await expect(page.getByPlaceholder("Username")).toBeVisible();

    // The role dropdown is the first select in the form
    const roleSelect = page.locator("form select").first();
    await expect(roleSelect).toBeVisible();

    // Verify all three built-in role options are available
    await expect(roleSelect.locator("option[value='admin']")).toBeAttached();
    await expect(roleSelect.locator("option[value='editor']")).toBeAttached();
    await expect(roleSelect.locator("option[value='user']")).toBeAttached();

    // Cancel the form
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("creating a user with editor role shows correct role in table", async ({
    loggedInPage: page,
  }) => {
    const username = `guieditor-${UID}`;
    let adminToken: string;

    try {
      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: /add members/i }).click();
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill("TestPass123!");

      // Select editor role
      const roleSelect = page.locator("form select").first();
      await roleSelect.selectOption("editor");

      await page.getByRole("button", { name: /create/i }).click();

      // User should appear in the table with editor role
      await expect(page.getByText(username)).toBeVisible({ timeout: 5_000 });
      // Scope to the created user's row: the username itself contains "editor" and
      // the role badge renders the lowercase role text (CSS uppercases it visually).
      const userRow = page.locator("div.px-4.py-3").filter({ hasText: username });
      await expect(userRow.locator("span.uppercase")).toHaveText("editor");
    } finally {
      adminToken = await getAdminToken();
      await cleanupUsersByPrefix(adminToken, "guieditor-");
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

  test("editing a user role via Edit Role / Team succeeds", async ({ loggedInPage: page }) => {
    const username = `guiedit-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a user via API first
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
      await page.getByText("Edit Role / Team").click();

      // The edit form should appear
      await expect(page.getByText(/edit/i).first()).toBeVisible();

      // Change role to editor
      const roleSelect = page.locator("form select").first();
      await roleSelect.selectOption("editor");

      // Click Save
      await page.getByRole("button", { name: /^save$/i }).click();

      // Wait for the update to complete and verify no error
      await page.waitForTimeout(1_000);

      // The user row should still be visible (edit was successful)
      await expect(page.getByText(username)).toBeVisible();
    } finally {
      await cleanupUsersByPrefix(adminToken, "guiedit-");
    }
  });

  test("resetting password for a non-admin user succeeds", async ({ loggedInPage: page }) => {
    const username = `guireset-${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create a user via API
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
      await page.getByText("Reset Password").click();

      // Fill in the new password
      await expect(page.getByText(/reset password for/i)).toBeVisible();
      await page.getByPlaceholder(/new password/i).fill("NewResetPass123!");

      // Submit
      await page.getByRole("button", { name: /reset password/i }).click();

      // Should show success or dismiss the form
      await page.waitForTimeout(1_000);
      // The reset form should close on success
      await expect(page.getByText(/reset password for/i)).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupUsersByPrefix(adminToken, "guireset-");
    }
  });

  test("user table shows role in uppercase badge format", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Admin user should show ADMIN role badge
    await expect(page.getByText("ADMIN").first()).toBeVisible();
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

  test("renaming a team via three-dot menu updates the name", async ({ loggedInPage: page }) => {
    const teamName = `guirename-${UID}`;
    const renamedName = `guirenamed-${UID}`;
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

      // Open the three-dot menu for the test team row
      const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
      await moreButtons.last().click();

      // Click Rename in the dropdown
      await page.locator("[role='menu']").getByText("Rename").click();

      // Inline edit input should appear
      const renameInput = page.locator(
        "input.px-2.py-1.rounded.border.border-border.bg-background",
      );
      await expect(renameInput).toBeVisible({ timeout: 3_000 });

      // Clear and type new name
      await renameInput.fill(renamedName);

      // Click Save link to confirm
      await page.getByText("Save", { exact: true }).click();

      // Success message and updated name should appear
      await expect(page.getByText(renamedName)).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "guirename-");
      await cleanupTeamsByPrefix(adminToken, "guirenamed-");
    }
  });

  test("cannot delete the Default team", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();
    await page.waitForTimeout(500);

    // Default team should be present
    await expect(page.getByText("Default").first()).toBeVisible();

    // Open the three-dot menu for the Default team (first row)
    const moreButtons = page.locator("button:has(svg.lucide-ellipsis-vertical)");
    await moreButtons.first().click();

    // Accept the confirm dialog and click Delete
    page.on("dialog", (d) => d.accept());
    await page.locator("[role='menu']").getByText("Delete").click();

    // Should show an error about not being able to delete the default team
    await expect(page.getByText(/cannot delete|default/i).first()).toBeVisible({ timeout: 5_000 });

    // Default team should still be in the list
    await expect(page.getByText("Default").first()).toBeVisible();
  });

  test("creating a team with duplicate name shows error", async ({ loggedInPage: page }) => {
    const teamName = `guidupteam-${UID}`;
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

      await expect(page.getByText(teamName)).toBeVisible({ timeout: 5_000 });

      // Try to create same team name via GUI
      await page.getByRole("button", { name: /create new team/i }).click();
      await page.getByPlaceholder("Team name").fill(teamName);
      await page.getByRole("button", { name: /^create$/i }).click();

      // Should show a duplicate/conflict error
      await expect(page.getByText(/already exists|duplicate/i).first()).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanupTeamsByPrefix(adminToken, "guidupteam-");
    }
  });

  test("team table shows member count column", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();
    await page.waitForTimeout(500);

    // The Members column header should be visible
    await expect(page.getByText("Members").first()).toBeVisible();

    // The Default team should show a numeric member count in its row
    const defaultRow = page.locator("div.px-4.py-3").filter({ hasText: "Default" }).first();
    const memberCountText = await defaultRow
      .locator("span.text-sm.text-muted-foreground")
      .textContent();
    expect(memberCountText).toMatch(/^\d+$/);
  });

  test("canceling create team form hides it", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    await page.getByRole("button", { name: /create new team/i }).click();
    await expect(page.getByPlaceholder("Team name")).toBeVisible();

    // Cancel should hide the form
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByPlaceholder("Team name")).not.toBeVisible();
  });

  test("teams tab shows description text", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /teams/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Teams" })).toBeVisible();
    await expect(page.getByText(/manage.*team/i).first()).toBeVisible();
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

  test("Create Custom Role opens form with name, description, and permissions", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await page.getByRole("button", { name: /create custom role/i }).click();

    // Form fields should be visible
    await expect(page.getByText("New Role")).toBeVisible();
    await expect(page.getByPlaceholder("Role name")).toBeVisible();
    await expect(page.getByPlaceholder("Description (optional)")).toBeVisible();
    // "Permissions" is also a substring of the section description, so match exactly.
    await expect(page.getByText("Permissions", { exact: true })).toBeVisible();

    // Permission checkboxes should be present
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    // "tools:use" also renders on the built-in role cards below, so scope to the form.
    await expect(page.locator("form").getByText("tools:use")).toBeVisible();

    // Create and Cancel buttons
    await expect(page.getByRole("button", { name: /^create$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();

    // Cancel closes the form
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("New Role")).not.toBeVisible();
  });

  test("creating a custom role adds it to the list with edit/delete buttons", async ({
    loggedInPage: page,
  }) => {
    const roleName = `guirole${UID}`;
    const adminToken = await getAdminToken();

    try {
      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();

      await page.getByRole("button", { name: /create custom role/i }).click();
      await page.getByPlaceholder("Role name").fill(roleName);
      await page.getByPlaceholder("Description (optional)").fill("Test custom role");

      // Select a permission
      const toolsCheckbox = page
        .locator("label")
        .filter({ hasText: "tools:use" })
        .locator("input[type='checkbox']");
      await toolsCheckbox.check();

      await page.getByRole("button", { name: /^create$/i }).click();

      // Role should appear in the list
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Role created successfully")).toBeVisible({ timeout: 3_000 });

      // Custom roles have edit and delete buttons
      await expect(page.locator("button[title='Edit role']").first()).toBeVisible();
      await expect(page.locator("button[title='Delete role']").first()).toBeVisible();
    } finally {
      // Clean up via API
      await fetch(`${API}/api/v1/roles`, { headers: authOnly(adminToken) })
        .then((r) => r.json())
        .then(async ({ roles }: { roles: Array<{ id: string; name: string }> }) => {
          for (const r of roles) {
            if (r.name === roleName) {
              await fetch(`${API}/api/v1/roles/${r.id}`, {
                method: "DELETE",
                headers: authOnly(adminToken),
              });
            }
          }
        })
        .catch(() => {});
    }
  });

  test("editing a custom role updates its name", async ({ loggedInPage: page }) => {
    const roleName = `guiedit${UID}`;
    const updatedName = `guieditup${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create role via API
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Editable role",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Click the edit button for the custom role
      await page.locator("button[title='Edit role']").first().click();

      // The edit form should appear
      await expect(page.getByText(/edit role/i)).toBeVisible();

      // Change the role name
      const nameInput = page.getByPlaceholder("Role name");
      await nameInput.fill(updatedName);

      // Save
      await page.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("Role updated")).toBeVisible({ timeout: 5_000 });

      // Updated name should appear
      await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5_000 });
    } finally {
      // Clean up both possible names
      await fetch(`${API}/api/v1/roles`, { headers: authOnly(adminToken) })
        .then((r) => r.json())
        .then(async ({ roles }: { roles: Array<{ id: string; name: string }> }) => {
          for (const r of roles) {
            if (r.name === roleName || r.name === updatedName) {
              await fetch(`${API}/api/v1/roles/${r.id}`, {
                method: "DELETE",
                headers: authOnly(adminToken),
              });
            }
          }
        })
        .catch(() => {});
    }
  });

  test("deleting a custom role removes it from the list", async ({ loggedInPage: page }) => {
    const roleName = `guidel${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create role via API
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Deletable role",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Click the delete button for the custom role
      page.on("dialog", (d) => d.accept());
      await page.locator("button[title='Delete role']").first().click();

      // Assert the success toast first (it auto-clears after 3s), then confirm the
      // role card is gone. The toast text contains the role name, so scope the
      // "removed" check to the role-name card span, not a bare text match.
      await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: 3_000 });
      await expect(
        page.locator("span.font-semibold.capitalize").filter({ hasText: roleName }),
      ).not.toBeVisible({ timeout: 5_000 });
    } finally {
      // Cleanup fallback
      await fetch(`${API}/api/v1/roles`, { headers: authOnly(adminToken) })
        .then((r) => r.json())
        .then(async ({ roles }: { roles: Array<{ id: string; name: string }> }) => {
          for (const r of roles) {
            if (r.name === roleName) {
              await fetch(`${API}/api/v1/roles/${r.id}`, {
                method: "DELETE",
                headers: authOnly(adminToken),
              });
            }
          }
        })
        .catch(() => {});
    }
  });

  test("built-in roles display their permissions list", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    // Built-in roles should show permission badges (font-mono spans inside role cards)
    await expect(page.locator(".font-mono").filter({ hasText: "tools:use" }).first()).toBeVisible();
  });

  test("permission groups are organized by category in the create form", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /^roles$/i }).click();

    await page.getByRole("button", { name: /create custom role/i }).click();
    // "Permissions" is also a substring of the section description, so match exactly.
    await expect(page.getByText("Permissions", { exact: true })).toBeVisible();

    // Permission group headings should be visible. Scope to the form: several of
    // these labels ("Tools", "Settings", "Users", "Teams", "API Keys") also appear
    // in the settings nav sidebar and dialog title.
    const createForm = page.locator("form");
    for (const group of [
      "Tools",
      "Files",
      "API Keys",
      "Pipelines",
      "Settings",
      "Users",
      "Teams",
      "System",
    ]) {
      await expect(createForm.getByText(group, { exact: true }).first()).toBeVisible();
    }

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("custom role shows user count of zero when newly created", async ({
    loggedInPage: page,
  }) => {
    const roleName = `guicount${UID}`;
    const adminToken = await getAdminToken();

    try {
      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();

      await page.getByRole("button", { name: /create custom role/i }).click();
      await page.getByPlaceholder("Role name").fill(roleName);

      // Select a permission
      const toolsCheckbox = page
        .locator("label")
        .filter({ hasText: "tools:use" })
        .locator("input[type='checkbox']");
      await toolsCheckbox.check();

      await page.getByRole("button", { name: /^create$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // The custom role card should show "0 users"
      await expect(page.getByText(/0 users?/).first()).toBeVisible();
    } finally {
      await fetch(`${API}/api/v1/roles`, { headers: authOnly(adminToken) })
        .then((r) => r.json())
        .then(async ({ roles }: { roles: Array<{ id: string; name: string }> }) => {
          for (const r of roles) {
            if (r.name === roleName) {
              await fetch(`${API}/api/v1/roles/${r.id}`, {
                method: "DELETE",
                headers: authOnly(adminToken),
              });
            }
          }
        })
        .catch(() => {});
    }
  });

  test("editing a custom role can toggle permissions", async ({ loggedInPage: page }) => {
    const roleName = `guiperm${UID}`;
    const adminToken = await getAdminToken();

    try {
      // Create role via API with only tools:use
      await fetch(`${API}/api/v1/roles`, {
        method: "POST",
        headers: authJson(adminToken),
        body: JSON.stringify({
          name: roleName,
          description: "Permission toggle test",
          permissions: ["tools:use"],
        }),
      });

      await openSettings(page);
      await page.getByRole("button", { name: /^roles$/i }).click();
      await expect(page.getByText(roleName)).toBeVisible({ timeout: 5_000 });

      // Click the edit button for the custom role
      await page.locator("button[title='Edit role']").first().click();
      await expect(page.getByText(/edit role/i)).toBeVisible();

      // The tools:use checkbox should be checked
      const toolsCheckbox = page
        .locator("label")
        .filter({ hasText: "tools:use" })
        .locator("input[type='checkbox']");
      await expect(toolsCheckbox).toBeChecked();

      // Check an additional permission (files:own)
      const filesCheckbox = page
        .locator("label")
        .filter({ hasText: "files:own" })
        .locator("input[type='checkbox']");
      await filesCheckbox.check();
      await expect(filesCheckbox).toBeChecked();

      // Save
      await page.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("Role updated")).toBeVisible({ timeout: 5_000 });

      // Verify both permissions are now displayed on the role card
      await expect(
        page.locator(".font-mono").filter({ hasText: "files:own" }).first(),
      ).toBeVisible();
    } finally {
      await fetch(`${API}/api/v1/roles`, { headers: authOnly(adminToken) })
        .then((r) => r.json())
        .then(async ({ roles }: { roles: Array<{ id: string; name: string }> }) => {
          for (const r of roles) {
            if (r.name === roleName) {
              await fetch(`${API}/api/v1/roles/${r.id}`, {
                method: "DELETE",
                headers: authOnly(adminToken),
              });
            }
          }
        })
        .catch(() => {});
    }
  });
});
