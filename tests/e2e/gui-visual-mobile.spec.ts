import { expect, test, uploadTestImage } from "./helpers";

const isDocker = process.env.CI === "true" || process.env.DOCKER === "true";
const MOD = process.platform === "darwin" ? "Meta" : "Control";

// ---------------------------------------------------------------------------
// Helper: toggle theme via keyboard shortcut (Cmd/Ctrl+Shift+D)
// On mobile the Footer with the theme toggle button is not rendered, so
// the keyboard shortcut is the reliable way to switch themes.
// ---------------------------------------------------------------------------
async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const wantDark = theme === "dark";
  if (isDark !== wantDark) {
    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Helper: take a themed screenshot pair (light + dark)
// ---------------------------------------------------------------------------
async function takeThemedScreenshots(page: import("@playwright/test").Page, baseName: string) {
  // Light theme
  await setTheme(page, "light");
  await expect(page).toHaveScreenshot(`mobile-${baseName}-light.png`, {
    fullPage: false,
  });

  // Dark theme
  await setTheme(page, "dark");
  await expect(page).toHaveScreenshot(`mobile-${baseName}-dark.png`, {
    fullPage: false,
  });

  // Reset to light for next test
  await setTheme(page, "light");
}

// ---------------------------------------------------------------------------
// Mobile visual regression: 375x667
// ---------------------------------------------------------------------------
test.describe("Visual Mobile (375x667)", () => {
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");
  test.use({ viewport: { width: 375, height: 667 } });

  // ---- Login page (unauthenticated) ----
  test.describe("Login page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login page stacked layout - light and dark", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Verify stacked layout: marketing panel should be hidden on mobile
      await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
      await expect(page.getByText("Your one-stop-shop")).not.toBeVisible();

      await takeThemedScreenshots(page, "login-empty");
    });
  });

  // ---- Home page (empty, no file uploaded) ----
  test("home page empty - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify mobile layout: top bar with hamburger visible, no desktop sidebar
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
    await expect(page.locator("aside")).not.toBeVisible();

    // Bottom navigation bar visible
    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav).toBeVisible();

    await takeThemedScreenshots(page, "home-empty");
  });

  // ---- Home page (file uploaded, Quick Actions visible) ----
  test("home page with file uploaded - light and dark", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    await expect(page.getByText("Quick Actions").first()).toBeVisible();

    await takeThemedScreenshots(page, "home-uploaded");
  });

  // ---- Fullscreen grid page ----
  test("fullscreen grid - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "fullscreen-grid");
  });

  // ---- Automate page (empty pipeline) ----
  test("automate page empty pipeline - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page.getByText(/pipeline|automate/i).first()).toBeVisible();

    await takeThemedScreenshots(page, "automate-empty");
  });

  // ---- Settings dialog - General tab ----
  test("settings dialog general tab - light and dark", async ({ loggedInPage: page }) => {
    // On mobile, open settings from the bottom nav bar
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Settings").click();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-general");
  });

  // ---- Settings dialog - About tab ----
  test("settings dialog about tab - light and dark", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Settings").click();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    // Navigate to About tab
    await page.getByRole("button", { name: "About" }).click();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-about");
  });

  // ---- Tool page - resize (empty, no file) ----
  test("resize tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "resize-empty");
  });

  // ---- Tool page - resize (file uploaded, settings visible) ----
  test("resize tool with file - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "resize-uploaded");
  });
});
