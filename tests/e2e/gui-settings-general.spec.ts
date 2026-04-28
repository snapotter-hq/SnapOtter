import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- General, System Settings, About tabs
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Dialog Navigation", () => {
  test("opens settings dialog from sidebar", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Dialog sidebar should render with the Settings heading
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();
  });

  test("dialog sidebar lists navigable section tabs", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

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
    await page.locator("aside").getByText("Settings").click();

    // Navigate to About section and confirm its heading
    await page.getByRole("button", { name: /about/i }).click();
    await expect(page.locator("h3").filter({ hasText: "About" })).toBeVisible();

    // Navigate back to General and confirm its heading
    await page.getByRole("button", { name: /general/i }).click();
    await expect(page.locator("h3").filter({ hasText: "General" })).toBeVisible();
  });

  test("closes dialog via the X button", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();

    // The close button renders the X icon inside the dialog
    const closeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-x") });
    await closeBtn.click();

    // Dialog content should disappear
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("closes dialog via Escape key", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("closes dialog by clicking the backdrop", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();

    // Click the backdrop overlay (the semi-transparent div behind the dialog)
    await page.locator(".bg-black\\/50").click({ position: { x: 10, y: 10 } });

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });
});

test.describe("GUI Settings - General Tab", () => {
  test("displays username and role badge", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // General section is the default; username and role should be visible
    await expect(page.getByText("admin").first()).toBeVisible();
    // The role is displayed as a capitalize text below the username
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });

  test("shows Default Tool View dropdown with options", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    await expect(page.getByText("Default Tool View")).toBeVisible();
    const select = page.locator("select").first();
    await expect(select).toBeVisible();

    // Verify the two options
    await expect(select.locator("option[value='sidebar']")).toHaveText("Sidebar");
    await expect(select.locator("option[value='fullscreen']")).toHaveText("Fullscreen Grid");
  });

  test("shows App Version string", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    await expect(page.getByText("App Version")).toBeVisible();
    // Version is in a monospace span matching semver pattern
    await expect(page.locator(".font-mono").filter({ hasText: /^\d+\.\d+\.\d+/ })).toBeVisible();
  });

  test("has a Save Settings button", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    await expect(page.getByRole("button", { name: /save settings/i })).toBeVisible();
  });

  test("logout button redirects to /login", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

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
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("App Name")).toBeVisible();
    const appNameInput = page.locator("input[type='text']").first();
    await expect(appNameInput).toBeVisible();
  });

  test("shows File Upload Limit input", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("File Upload Limit (MB)")).toBeVisible();
    await expect(page.locator("input[type='number']").first()).toBeVisible();
  });

  test("shows Default Theme dropdown", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
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
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /system settings/i }).click();

    await expect(page.getByText("Login Attempt Limit")).toBeVisible();
  });

  test("Save Settings button persists changes", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
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
    await page.locator("aside").getByText("Settings").click();
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
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /about/i }).click();

    await expect(page.getByRole("link", { name: /github repository/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /documentation/i })).toBeVisible();
  });
});
