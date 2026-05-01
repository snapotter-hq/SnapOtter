import { expect, openSettings, test, uploadTestImage } from "./helpers";

const isDocker = process.env.CI === "true" || process.env.DOCKER === "true";

// ---------------------------------------------------------------------------
// Helper: toggle theme and wait for CSS transition to settle
// ---------------------------------------------------------------------------
async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const wantDark = theme === "dark";
  if (isDark !== wantDark) {
    const themeBtn = page.locator("button[title='Toggle Theme']");
    await themeBtn.click();
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Helper: take a themed screenshot pair (light + dark) for a given page state
// ---------------------------------------------------------------------------
async function takeThemedScreenshots(page: import("@playwright/test").Page, baseName: string) {
  // Light theme
  await setTheme(page, "light");
  await expect(page).toHaveScreenshot(`${baseName}-light.png`, {
    fullPage: false,
  });

  // Dark theme
  await setTheme(page, "dark");
  await expect(page).toHaveScreenshot(`${baseName}-dark.png`, {
    fullPage: false,
  });

  // Reset to light for next test
  await setTheme(page, "light");
}

// ---------------------------------------------------------------------------
// Desktop visual regression: 1280x720
// ---------------------------------------------------------------------------
test.describe("Visual Desktop (1280x720)", () => {
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");
  test.use({ viewport: { width: 1280, height: 720 } });

  // ---- Login page (unauthenticated) ----
  test.describe("Login page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login page empty form - light and dark", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Login page has its own theme toggle in the footer only when Footer
      // is rendered. On the login page, the footer may not be present because
      // the login page uses a standalone layout. Instead we use the keyboard
      // shortcut (Cmd/Ctrl+Shift+D) to toggle theme.
      const MOD = process.platform === "darwin" ? "Meta" : "Control";

      // Light screenshot
      await expect(page).toHaveScreenshot("login-empty-light.png", {
        fullPage: false,
      });

      // Toggle to dark
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot("login-empty-dark.png", {
        fullPage: false,
      });
    });
  });

  // ---- Home page (empty, no file uploaded) ----
  test("home page empty - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "home-empty");
  });

  // ---- Home page (file uploaded, Quick Actions visible) ----
  test("home page with file uploaded - light and dark", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Verify Quick Actions appeared before capturing
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

    await expect(page.getByText("Pipeline Builder")).toBeVisible();

    await takeThemedScreenshots(page, "automate-empty");
  });

  // ---- Settings dialog - General tab ----
  test("settings dialog general tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-general");
  });

  // ---- Settings dialog - About tab ----
  test("settings dialog about tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);

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

    // Verify settings panel appeared
    await expect(page.getByText("Settings").first()).toBeVisible();

    await takeThemedScreenshots(page, "resize-uploaded");
  });
});
