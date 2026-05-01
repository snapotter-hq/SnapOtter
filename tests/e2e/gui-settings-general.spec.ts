import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- General, System Settings, About tabs
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Dialog Navigation", () => {
  test("opens settings dialog from sidebar", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Dialog sidebar should render with the Settings heading
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();
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
});

test.describe("GUI Settings - General Tab", () => {
  test("displays username and role badge", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // General section is the default; username and role should be visible
    await expect(page.getByText("admin").first()).toBeVisible();
    // The role is displayed as a capitalize text below the username
    await expect(page.getByText(/admin/i).first()).toBeVisible();
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

  test("logout button redirects to /login", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const logoutBtn = page.getByRole("button", { name: /log out/i });
    await expect(logoutBtn).toBeVisible();

    await logoutBtn.click();
    await page.waitForURL("/login", { timeout: 10_000 });

    // Should be on the login page
    expect(page.url()).toContain("/login");
  });
});

test.describe("GUI Settings - System Settings Tab", () => {
  test("shows App Name input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("App Name")).toBeVisible();
    const appNameInput = page.locator("input[type='text']").first();
    await expect(appNameInput).toBeVisible();
  });

  test("shows File Upload Limit input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();
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

  test("shows Login Attempt Limit input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Login Attempt Limit")).toBeVisible();
  });

  test("Save Settings button persists changes", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();

    // Wait for section to load
    await expect(page.getByText("App Name")).toBeVisible();

    // Click save
    await page.getByRole("button", { name: /save settings/i }).click();

    // Should show a success message
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
    // Should have many tools (SnapOtter has 47)
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
    await expect(page.getByText(/images never leave your machine/i)).toBeVisible();
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

test.describe("GUI Settings - Save and Persistence", () => {
  test("System Settings save persists after dialog close and reopen", async ({
    loggedInPage: page,
  }) => {
    // Navigate to System Settings tab
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("App Name")).toBeVisible({ timeout: 5_000 });

    // Wait for the input to load
    const appNameInput = page.locator("input[type='text']").first();
    await expect(appNameInput).toBeVisible();
    const originalName = await appNameInput.inputValue();
    const testName = originalName === "SnapOtter" ? "TestApp" : "SnapOtter";

    // Change the App Name
    await appNameInput.fill(testName);

    // Save
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });

    // Close the dialog
    await page.keyboard.press("Escape");
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();

    // Reopen the dialog and go to System Settings
    await openSettings(page);
    await page.getByRole("button", { name: /system settings/i }).click();
    await expect(page.getByText("App Name")).toBeVisible();

    // Verify the setting persisted
    const persistedName = await page.locator("input[type='text']").first().inputValue();
    expect(persistedName).toBe(testName);

    // Restore original name
    await page.locator("input[type='text']").first().fill(originalName);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 5_000 });
  });
});
