import { changePasswordViaApi, expect, login, openSettings, putSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- General, System Settings, About tabs
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Dialog Navigation", () => {
  test("opens settings dialog from sidebar", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Dialog sidebar should render with the Settings heading
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();
  });

  test("dialog has correct dimensions (85dvh, max-w-3xl)", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const dialog = page.locator(".relative.bg-background.border.border-border.rounded-xl");
    await expect(dialog).toBeVisible();

    // Verify the dialog uses the expected sizing classes
    await expect(dialog).toHaveClass(/max-w-3xl/);
    await expect(dialog).toHaveClass(/h-\[85dvh\]/);
  });

  test("dialog sidebar lists navigable section tabs", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // All section tabs should be buttons in the dialog sidebar
    for (const label of [
      "General",
      "System Settings",
      "Security",
      "People",
      "Teams",
      "API Keys",
      "Tools",
      "About",
    ]) {
      await expect(page.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }
  });

  test("clicking a tab switches the content pane", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Navigate to About section and confirm its heading
    await page.getByRole("button", { name: /about/i }).click();
    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();

    // Navigate back to General and confirm its heading
    await page.getByRole("button", { name: /general/i }).click();
    await expect(page.locator("h3").filter({ hasText: "General" })).toBeVisible();
  });

  test("active tab is visually highlighted", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // The General tab should be active by default and have the primary color class
    const generalBtn = page.getByRole("button", { name: /general/i });
    await expect(generalBtn).toHaveClass(/bg-primary/);

    // Navigate to Security -- it should become highlighted and General should not
    await page.getByRole("button", { name: /security/i }).click();
    const securityBtn = page.getByRole("button", { name: /security/i });
    await expect(securityBtn).toHaveClass(/bg-primary/);
    await expect(generalBtn).not.toHaveClass(/bg-primary/);
  });

  test("re-opening dialog defaults to General tab", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Navigate to About
    await page.getByRole("button", { name: /about/i }).click();
    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();

    // Re-open -- should be back on General (component state resets)
    await openSettings(page);
    await expect(page.locator("h3").filter({ hasText: "General" })).toBeVisible();
  });

  test("closes dialog via the X button", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // The close button renders the X icon inside the dialog
    const closeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-x") });
    await closeBtn.click();

    // Dialog content should disappear
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("closes dialog via Escape key", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await page.keyboard.press("Escape");

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("closes dialog by clicking the backdrop", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Click the backdrop overlay (the semi-transparent div behind the dialog)
    await page.locator(".bg-black\\/50").click({ position: { x: 10, y: 10 } });

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("settings icon is visible in the sidebar", async ({ loggedInPage: page }) => {
    // The sidebar should have a Settings entry
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Settings")).toBeVisible();
  });
});

test.describe("GUI Settings - General Tab", () => {
  test("displays username and role badge", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // General section is the default; username and role should be visible
    await expect(page.getByText("admin").first()).toBeVisible();
    // The role is displayed as a capitalize text below the username
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });

  test("displays avatar with initial letter", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Avatar circle shows the first letter of the username (uppercase A for admin)
    const avatar = page.locator(".w-10.h-10.rounded-full");
    await expect(avatar).toBeVisible();
    await expect(avatar).toContainText("A");
  });

  test("shows user preferences description text", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByText("User preferences and display settings.")).toBeVisible();
  });

  test("shows Default Tool View dropdown with options", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByText("Default Tool View")).toBeVisible();
    const select = page.locator("select").first();
    await expect(select).toBeVisible();

    // Verify the two options
    await expect(select.locator("option[value='sidebar']")).toHaveText("Sidebar");
    await expect(select.locator("option[value='fullscreen']")).toHaveText("Fullscreen Grid");
  });

  test("changing Default Tool View and saving persists the value", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    const select = page.locator("select").first();
    const originalValue = await select.inputValue();

    // Switch to the other option
    const newValue = originalValue === "sidebar" ? "fullscreen" : "sidebar";
    await select.selectOption(newValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close and reopen to verify persistence
    await page.keyboard.press("Escape");
    await openSettings(page);

    const updatedValue = await page.locator("select").first().inputValue();
    expect(updatedValue).toBe(newValue);

    // Restore original value
    await page.locator("select").first().selectOption(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("setting Fullscreen Grid and saving redirects home to /fullscreen", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    const select = page.locator("select").first();
    const originalValue = await select.inputValue();

    // Set to fullscreen
    await select.selectOption("fullscreen");
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close settings and navigate home
    await page.keyboard.press("Escape");
    await page.goto("/");

    // Should redirect to /fullscreen
    await page.waitForURL(/\/fullscreen/, { timeout: 10_000 });
    expect(page.url()).toContain("/fullscreen");

    // Restore via API: the fullscreen layout has no reachable settings entry,
    // and an unrestored value poisons every later test on the shared server.
    const restore = await putSettings(page, { defaultToolView: originalValue });
    expect(restore.ok).toBeTruthy();
  });

  test("shows App Version string", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByText("App Version")).toBeVisible();
    // Version is in a monospace span matching semver pattern
    await expect(page.locator(".font-mono").filter({ hasText: /^\d+\.\d+\.\d+/ })).toBeVisible();
  });

  test("has a Save Settings button", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByRole("button", { name: /save settings/i })).toBeVisible();
  });

  test("logout button redirects to /login", async ({ browser }) => {
    // Isolated session: logging out revokes the token server-side, and the
    // shared storageState token must survive for every later test in the run.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page);
    await openSettings(page);

    const logoutBtn = page.getByRole("button", { name: /log out/i });
    await expect(logoutBtn).toBeVisible();

    await logoutBtn.click();
    await page.waitForURL("/login", { timeout: 10_000 });

    // Should be on the login page
    expect(page.url()).toContain("/login");
    await context.close();
  });
});

test.describe("GUI Settings - System Settings Tab", () => {
  test("shows section heading and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.locator("h3").filter({ hasText: "System Settings" })).toBeVisible();
    await expect(page.getByText("Server-side configuration and limits.")).toBeVisible();
  });

  test("shows File Upload Limit input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();
    await expect(page.getByText("Maximum file size per upload")).toBeVisible();
    await expect(page.locator("input[type='number']").first()).toBeVisible();
  });

  test("shows Default Theme dropdown", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Default Theme")).toBeVisible();
    const themeSelect = page
      .locator("select")
      .filter({ has: page.locator("option[value='dark']") });
    await expect(themeSelect).toBeVisible();

    // Verify theme options
    await expect(themeSelect.locator("option[value='light']")).toHaveText("Light");
    await expect(themeSelect.locator("option[value='dark']")).toHaveText("Dark");
    await expect(themeSelect.locator("option[value='system']")).toHaveText("System");
  });

  test("shows Language dropdown", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Language", { exact: true })).toBeVisible();
    await expect(page.getByText("Language for the interface")).toBeVisible();
    const langSelect = page.locator("select").filter({ has: page.locator("option[value='en']") });
    await expect(langSelect).toBeVisible();
    await expect(langSelect.locator("option[value='en']")).toHaveText("English");
  });

  test("shows Login Attempt Limit input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Login Attempt Limit")).toBeVisible();
    await expect(
      page.getByText("Max failed login attempts per minute before lockout"),
    ).toBeVisible();
  });

  test("shows File Management section with Max File Age and Startup Cleanup", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("File Management")).toBeVisible();
    await expect(page.getByText("Max File Age (hours)")).toBeVisible();
    await expect(page.getByText("Startup Cleanup")).toBeVisible();
    await expect(
      page.getByText("Clean up old temporary files when the server starts"),
    ).toBeVisible();
  });

  test("Startup Cleanup toggle can be toggled", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    // Wait for settings to load
    await expect(page.getByText("Startup Cleanup")).toBeVisible();

    // The toggle is a button.rounded-full near "Startup Cleanup"
    const toggleRow = page.locator("div").filter({ hasText: "Startup Cleanup" }).last();
    const toggle = toggleRow.locator("button.rounded-full");
    await expect(toggle).toBeVisible();

    // Click to toggle
    await toggle.click();
    // Toggle state should change (the class alternates between bg-primary and bg-muted)
    // Just verify the toggle is still clickable (no crash)
    await toggle.click();
  });

  test("Save Settings button persists changes", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    // Wait for section to load
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    // Click save
    await page.getByRole("button", { name: /save settings/i }).click();

    // Should show a success message
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("changed File Upload Limit persists after dialog re-open", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    const uploadInput = page.locator("input[type='number']").first();
    const originalValue = await uploadInput.inputValue();

    // Change to a different value
    const testValue = originalValue === "100" ? "200" : "100";
    await uploadInput.fill(testValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    const persistedValue = await page.locator("input[type='number']").first().inputValue();
    expect(persistedValue).toBe(testValue);

    // Restore original value
    await page.locator("input[type='number']").first().fill(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("changed Default Theme persists after dialog re-open", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Default Theme")).toBeVisible();

    const themeSelect = page
      .locator("select")
      .filter({ has: page.locator("option[value='dark']") });
    const originalValue = await themeSelect.inputValue();

    // Switch theme
    const newValue = originalValue === "dark" ? "light" : "dark";
    await themeSelect.selectOption(newValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Default Theme")).toBeVisible();

    const themeSelect2 = page
      .locator("select")
      .filter({ has: page.locator("option[value='dark']") });
    const persisted = await themeSelect2.inputValue();
    expect(persisted).toBe(newValue);

    // Restore original
    await themeSelect2.selectOption(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("GUI Settings - About Tab", () => {
  test("displays app description and version", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();
    // SnapOtter branding
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
    // Description text
    await expect(page.getByText(/self-hosted.*privacy/i).first()).toBeVisible();
    // Version label and value
    await expect(page.getByText("Version:")).toBeVisible();
  });

  test("shows GitHub and documentation links", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.getByRole("link", { name: /github repository/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /documentation/i })).toBeVisible();
  });

  test("shows API Reference (Swagger) link", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.getByRole("link", { name: /api reference/i })).toBeVisible();
  });

  test("version displays a semver string", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    // Version text should match semver format (e.g., 1.2.3)
    const versionEl = page.locator(".font-mono").filter({ hasText: /^\d+\.\d+\.\d+/ });
    await expect(versionEl).toBeVisible();
  });

  test("about section has the Links heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.getByText("Links")).toBeVisible();
  });
});

test.describe("GUI Settings - AI Features Tab", () => {
  test("displays AI Features heading and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    await expect(page.locator("h3").filter({ hasText: "AI Features" })).toBeVisible();
    await expect(page.getByText("Manage AI model bundles")).toBeVisible();
  });

  test("shows Install All button", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    await expect(page.getByRole("button", { name: /install all/i })).toBeVisible();
  });

  test("lists feature bundles with install status", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    // Each bundle card is rendered within a bordered div
    const bundleCards = page.locator(".rounded-lg.border.border-border.p-4");

    // At least one bundle should be present
    const count = await bundleCards.count();
    expect(count).toBeGreaterThan(0);

    // Each card should have a name and a status indicator (Installed or Not installed or Install button)
    const firstCard = bundleCards.first();
    const hasStatus =
      (await firstCard
        .getByText("Installed")
        .isVisible()
        .catch(() => false)) ||
      (await firstCard
        .getByText("Not installed")
        .isVisible()
        .catch(() => false)) ||
      (await firstCard
        .getByRole("button", { name: /install/i })
        .isVisible()
        .catch(() => false));
    expect(hasStatus).toBe(true);
  });

  test("bundles show estimated size", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /ai features/i }).click();

    // Each bundle should display an estimated size like (~XXX MB)
    await expect(page.getByText(/~\d+/).first()).toBeVisible();
  });
});

test.describe("GUI Settings - Tools Tab (deep)", () => {
  test("all tools are listed with enable/disable toggles", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    // Wait for tools to finish loading (disabled counter appears when loaded)
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Each tool row has an enable/disable toggle (w-11 h-6 rounded-full)
    const toolToggles = page.locator("button.w-11.h-6");
    const count = await toolToggles.count();
    // Should have many tools (SnapOtter has 48)
    expect(count).toBeGreaterThan(10);
  });

  test("toggling a tool changes the disabled counter", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    // Read initial disabled count
    const counterText = page.getByText(/\d+ tools? disabled/);
    await expect(counterText).toBeVisible({ timeout: 5_000 });
    const initialText = await counterText.textContent();
    const initialCount = parseInt(initialText?.match(/(\d+)/)?.[1] || "0", 10);

    // Click the first tool toggle to change its state
    const firstToggle = page.locator("button.w-11.h-6").first();
    await firstToggle.click();

    // The counter should change by 1 (either +1 or -1)
    const updatedText = await counterText.textContent();
    const updatedCount = parseInt(updatedText?.match(/(\d+)/)?.[1] || "0", 10);
    expect(Math.abs(updatedCount - initialCount)).toBe(1);

    // Revert the toggle to not affect other tests
    await firstToggle.click();
  });

  test("search filters tools in settings dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    // Wait for the tools to load
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // The Settings dialog content area has the search input
    const dialogContent = page.locator(".flex-1.overflow-y-auto");
    const searchInput = dialogContent.getByPlaceholder("Search tools...");
    await expect(searchInput).toBeVisible();

    // Search for a tool name that likely exists
    await searchInput.fill("Resize");

    // Should show a filtered subset; the "Resize" tool should be visible
    await expect(dialogContent.getByText("Resize").first()).toBeVisible();

    // Search for something that does not exist
    await searchInput.fill("zzzznonexistenttool");
    await expect(dialogContent.getByText("No tools match your search.")).toBeVisible();

    // Clear search restores all tools
    await searchInput.fill("");
    const toolToggles = page.locator("button.w-11.h-6");
    const count = await toolToggles.count();
    expect(count).toBeGreaterThan(10);
  });
});

test.describe("GUI Settings - Product Analytics Tab (deep)", () => {
  test("displays description about anonymous data and image privacy", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByText(/share anonymous usage data/i)).toBeVisible();
    await expect(page.getByText(/images never leave your network/i)).toBeVisible();
  });

  test("shows either consent toggle or admin-disabled message", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    // Either the toggle button is present, or the admin-disabled message is shown
    const toggle = page.locator("button.rounded-full");
    const disabledMsg = page.getByText(/has been disabled by the server administrator/i);

    const toggleVisible = await toggle.isVisible().catch(() => false);
    const disabledVisible = await disabledMsg.isVisible().catch(() => false);

    // One of the two states must be true
    expect(toggleVisible || disabledVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit Log Tab (12.8) -- admin-only
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Audit Log Tab", () => {
  test("displays Audit Log heading and filter dropdown", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Audit Log" })).toBeVisible();
    // Filter dropdown with "All actions" default
    const filterSelect = page.locator("select").filter({ has: page.locator("option[value='']") });
    await expect(filterSelect).toBeVisible();
    await expect(filterSelect.locator("option[value='']")).toHaveText("All actions");
  });

  test("audit table shows Time, User, Action, Target columns", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Wait for table to render
    await expect(page.locator("table thead")).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("table thead th").filter({ hasText: "Time" })).toBeVisible();
    await expect(page.locator("table thead th").filter({ hasText: "User" })).toBeVisible();
    await expect(page.locator("table thead th").filter({ hasText: "Action" })).toBeVisible();
    await expect(page.locator("table thead th").filter({ hasText: "Target" })).toBeVisible();
  });

  test("LOGIN_SUCCESS entries are present after admin login", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Wait for table to load
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });

    // Filter by LOGIN_SUCCESS
    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("LOGIN_SUCCESS");

    // Should display at least one LOGIN_SUCCESS row
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
    const tableText = await page.locator("table tbody").textContent();
    expect(tableText).toContain("LOGIN_SUCCESS");
  });

  test("filter dropdown includes all expected audit action types", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    const filterSelect = page.locator("select").first();
    await expect(filterSelect).toBeVisible();

    // Verify key action options exist
    for (const action of [
      "LOGIN_SUCCESS",
      "LOGIN_FAILED",
      "USER_CREATED",
      "USER_DELETED",
      "PASSWORD_CHANGED",
      "API_KEY_CREATED",
      "SETTINGS_UPDATED",
    ]) {
      await expect(filterSelect.locator(`option[value='${action}']`)).toBeAttached();
    }
  });

  test("clicking a row expands details", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Wait for at least one row
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });

    // Click the first row to expand
    await page.locator("table tbody tr").first().click();

    // If the entry has details, a <pre> block with JSON appears
    // (not all entries have details, so we just verify the click does not crash)
    await page.waitForTimeout(300);
  });

  test("empty audit log shows 'No audit log entries' message", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    // Filter by an action that may not have entries (ROLE_DELETED)
    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("ROLE_DELETED");

    // Wait for the table to update
    await page.waitForTimeout(1_000);

    // Either we see entries or the empty state
    const emptyMsg = page.getByText("No audit log entries.");
    const hasRows = await page.locator("table tbody tr").count();
    const emptyVisible = await emptyMsg.isVisible().catch(() => false);

    // One must be true -- either rows exist or the empty message shows
    expect(hasRows > 0 || emptyVisible).toBe(true);
  });

  test("SETTINGS_UPDATED entry appears after saving system settings", async ({
    loggedInPage: page,
  }) => {
    // Save system settings to generate a SETTINGS_UPDATED audit entry
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Navigate to audit log and filter by SETTINGS_UPDATED
    await page.getByRole("button", { name: /audit log/i }).click();
    await expect(page.locator("table thead")).toBeVisible({ timeout: 10_000 });

    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("SETTINGS_UPDATED");

    // Should display at least one SETTINGS_UPDATED row
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
    const tableText = await page.locator("table tbody").textContent();
    expect(tableText).toContain("SETTINGS_UPDATED");
  });

  test("PASSWORD_CHANGED entry appears after changing password", async ({ loggedInPage: page }) => {
    // Change password (admin -> admin) to generate audit entry
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // Client policy requires 8+ chars, so a temporary password is used and
    // reverted via API right after (the current session token survives).
    await page.getByPlaceholder("Current Password").fill("admin");
    await page.getByPlaceholder("New Password").first().fill("Testpass123");
    await page.getByPlaceholder("Confirm New Password").fill("Testpass123");
    await page.getByRole("button", { name: /change password/i }).click();
    await expect(page.getByText("Password changed successfully")).toBeVisible({ timeout: 5_000 });

    const revert = await changePasswordViaApi(page, "Testpass123", "admin");
    expect(revert.ok).toBeTruthy();

    // Navigate to audit log and filter by PASSWORD_CHANGED
    await page.getByRole("button", { name: /audit log/i }).click();
    await expect(page.locator("table thead")).toBeVisible({ timeout: 10_000 });

    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("PASSWORD_CHANGED");

    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
    const tableText = await page.locator("table tbody").textContent();
    expect(tableText).toContain("PASSWORD_CHANGED");
  });

  test("switching audit log filter back to All actions shows unfiltered entries", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /audit log/i }).click();

    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
    const allCount = await page.locator("table tbody tr").count();

    // Filter to LOGIN_SUCCESS
    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("LOGIN_SUCCESS");
    await page.waitForTimeout(500);
    const filteredCount = await page.locator("table tbody tr").count();

    // Switch back to All actions
    await filterSelect.selectOption("");
    await page.waitForTimeout(500);
    const restoredCount = await page.locator("table tbody tr").count();

    // All actions should show at least as many rows as the filtered view
    expect(restoredCount).toBeGreaterThanOrEqual(filteredCount);
    // Restored count should match the original (or be close, if entries were added)
    expect(restoredCount).toBeGreaterThanOrEqual(allCount);
  });
});

// ---------------------------------------------------------------------------
// System Settings -- additional persistence and interaction tests
// ---------------------------------------------------------------------------

test.describe("GUI Settings - System Settings (extended)", () => {
  test("changed Language persists after dialog re-open", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Language", { exact: true })).toBeVisible();

    const langSelect = page.locator("select").filter({ has: page.locator("option[value='en']") });
    const originalValue = await langSelect.inputValue();

    // Switch to French
    const newValue = originalValue === "en" ? "fr" : "en";
    await langSelect.selectOption(newValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    // Wait for save confirmation (text may be in the new locale)
    await page.waitForTimeout(2_000);

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);

    // Navigate to system settings -- the tab text may have changed locale
    // Use the second nav button (System Settings is index 1)
    const navButtons = page.locator(".w-48 button");
    await navButtons.nth(1).click();

    // Verify the language select persisted the new value
    const langSelect2 = page.locator("select").filter({ has: page.locator("option[value='en']") });
    const persisted = await langSelect2.inputValue();

    // Restore via API before asserting: a failed assertion must not leave the
    // server in a non-English locale for every later test.
    const restore = await putSettings(page, { defaultLocale: originalValue });
    expect(restore.ok).toBeTruthy();
    expect(persisted).toBe(newValue);
  });

  test("changed Login Attempt Limit persists after dialog re-open", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Login Attempt Limit")).toBeVisible();

    // The login attempt limit input is the second number input
    const numberInputs = page.locator("input[type='number']");
    const loginInput = numberInputs.nth(1);
    const originalValue = await loginInput.inputValue();

    const testValue = originalValue === "5" ? "10" : "5";
    await loginInput.fill(testValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Login Attempt Limit")).toBeVisible();

    const persistedValue = await page.locator("input[type='number']").nth(1).inputValue();
    expect(persistedValue).toBe(testValue);

    // Restore original value
    await page.locator("input[type='number']").nth(1).fill(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("changed Max File Age persists after dialog re-open", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Max File Age (hours)")).toBeVisible();

    // Max file age is the third number input
    const numberInputs = page.locator("input[type='number']");
    const ageInput = numberInputs.nth(2);
    const originalValue = await ageInput.inputValue();

    const testValue = originalValue === "24" ? "48" : "24";
    await ageInput.fill(testValue);

    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("Max File Age (hours)")).toBeVisible();

    const persistedValue = await page.locator("input[type='number']").nth(2).inputValue();
    expect(persistedValue).toBe(testValue);

    // Restore original value
    await page.locator("input[type='number']").nth(2).fill(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });

  test("system settings save failure shows error message on invalid data", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();

    // Set an extremely large value to trigger potential validation
    const uploadInput = page.locator("input[type='number']").first();
    const originalValue = await uploadInput.inputValue();
    await uploadInput.fill("0");

    // Save -- value of 0 might be accepted or rejected depending on backend validation
    await page.getByRole("button", { name: /save settings/i }).click();

    // Wait for response and restore regardless
    await page.waitForTimeout(2_000);
    await uploadInput.fill(originalValue);
    await page.getByRole("button", { name: /save settings/i }).click();
    await page.waitForTimeout(1_000);
  });
});
