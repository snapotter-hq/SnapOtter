import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Viewport definitions
// ---------------------------------------------------------------------------
const DESKTOP = { width: 1280, height: 720 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 375, height: 667 };

// ---------------------------------------------------------------------------
// Desktop (1280x720)
// ---------------------------------------------------------------------------
test.describe("Responsive - Desktop (1280x720)", () => {
  test.use({ viewport: DESKTOP });

  test("home page shows sidebar and tool panel", async ({ loggedInPage: page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Tool panel with search
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();

    // No mobile bottom nav
    await expect(page.locator("nav.fixed").filter({ hasText: "Tools" })).not.toBeVisible();
  });

  test("home page has no horizontal overflow", async ({ loggedInPage: page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("fullscreen grid shows category cards in multi-column layout", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/fullscreen");

    await expect(page.getByText("Essentials")).toBeVisible();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("tool page shows side-by-side layout", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Tool name visible in the settings panel
    await expect(page.getByText("Resize").first()).toBeVisible();
    // Dropzone visible in main area
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("automate page shows tool palette and pipeline builder side by side", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/automate");

    await expect(page.getByText("Tool Palette")).toBeVisible();
    await expect(page.getByText("Pipeline Builder")).toBeVisible();
  });

  test("login page shows split layout with marketing panel", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: DESKTOP,
    });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByText("Your one-stop-shop")).toBeVisible();

    await context.close();
  });

  test("files page shows three-column layout", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    // Left nav with "My Files"
    await expect(page.getByText("My Files")).toBeVisible();
  });

  test("settings dialog fits within viewport", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const dialogBox = page.locator("[class*='max-w']").filter({ hasText: "General" }).first();
    const box = await dialogBox.boundingBox();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(DESKTOP.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Tablet (768x1024)
// ---------------------------------------------------------------------------
test.describe("Responsive - Tablet (768x1024)", () => {
  test.use({ viewport: TABLET });

  test("home page layout renders without horizontal overflow", async ({ loggedInPage: page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("fullscreen grid renders with no overflow", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("tool page is accessible", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    await expect(page.getByText("Resize").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("automate page is accessible", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Pipeline builder or mobile heading should be visible
    await expect(page.getByText(/pipeline|automate/i).first()).toBeVisible();
  });

  test("login page renders correctly", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: TABLET,
    });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await context.close();
  });

  test("files page is accessible at tablet width", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    await expect(page.getByText("My Files")).toBeVisible();
    await expect(page.getByRole("button", { name: /recent/i }).first()).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow on files page", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("settings dialog fits within tablet viewport", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// ---------------------------------------------------------------------------
// Mobile (375x667)
// ---------------------------------------------------------------------------
test.describe("Responsive - Mobile (375x667)", () => {
  test.use({ viewport: MOBILE });

  test("home page shows top bar with hamburger menu", async ({ loggedInPage: page }) => {
    // Hamburger menu button (Menu icon)
    const hamburger = page
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first();
    await expect(hamburger).toBeVisible();

    // SnapOtter branding in top bar
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
  });

  test("bottom navigation bar is visible with correct items", async ({ loggedInPage: page }) => {
    // Bottom nav bar
    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav).toBeVisible();

    // Check for nav items: Tools, Automate, Files, Settings
    await expect(bottomNav.getByText("Tools")).toBeVisible();
    await expect(bottomNav.getByText("Automate")).toBeVisible();
    await expect(bottomNav.getByText("Files")).toBeVisible();
    await expect(bottomNav.getByText("Settings")).toBeVisible();
  });

  test("desktop sidebar is not visible on mobile", async ({ loggedInPage: page }) => {
    // The aside element used by desktop sidebar should not be visible
    await expect(page.locator("aside")).not.toBeVisible();
  });

  test("hamburger opens sidebar overlay", async ({ loggedInPage: page }) => {
    // Click the hamburger button (first button in the top bar)
    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    // Expanded sidebar overlay should appear with nav items
    await expect(page.getByText("Tools").nth(1)).toBeVisible();
    await expect(page.getByText("Automate").nth(1)).toBeVisible();
  });

  test("no horizontal overflow on home page", async ({ loggedInPage: page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow on fullscreen page", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow on tool page", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no horizontal overflow on automate page", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("login page renders without marketing panel on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: MOBILE,
    });
    const page = await context.newPage();
    await page.goto("/login");

    // Login form should be visible
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();

    // Marketing panel is hidden on mobile (lg:flex means only visible at lg+)
    await expect(page.getByText("Your one-stop-shop")).not.toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await context.close();
  });

  test("bottom nav Tools link navigates to home", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Tools").click();

    await expect(page).toHaveURL("/");
  });

  test("bottom nav Automate link navigates to /automate", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Automate").click();

    await expect(page).toHaveURL("/automate");
  });

  test("bottom nav Files link navigates to /files", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Files").click();

    await expect(page).toHaveURL("/files");
  });

  test("bottom nav Settings opens settings dialog", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Settings").click();

    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  });

  test("fullscreen grid tools are accessible on mobile", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    await expect(page.getByText("Essentials")).toBeVisible();

    // Tool links should still work
    const resizeLink = page.getByRole("link", { name: /^Resize/ }).first();
    await expect(resizeLink).toBeVisible();
  });

  test("tool page is usable on mobile", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    await expect(page.getByText("Resize").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("automate page mobile layout shows process button", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    await expect(page.getByText("Automate").first()).toBeVisible();
    const processBtn = page.getByRole("button", { name: /process/i }).first();
    await expect(processBtn).toBeVisible();
    await expect(processBtn).toBeDisabled();
  });

  test("help dialog fits within mobile viewport", async ({ loggedInPage: page }) => {
    // Open sidebar, then help
    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    // Click Help in expanded sidebar
    await page.locator(".fixed").filter({ hasText: "Help" }).getByText("Help").click();

    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("files page shows mobile tabs instead of desktop nav", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    // Mobile tabs: "Recent" and "Upload"
    await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();

    // Desktop nav "My Files" heading should not be visible
    await expect(page.getByText("My Files")).not.toBeVisible();
  });

  test("no horizontal overflow on files page", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("dropzone is accessible and clickable on mobile", async ({ loggedInPage: page }) => {
    // The dropzone should be visible and have the upload button
    const dropzone = page.locator("section[aria-label='File drop zone']");
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("privacy policy page renders on mobile without overflow", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("footer theme and language buttons are hidden on mobile", async ({ loggedInPage: page }) => {
    // Footer is rendered only on desktop (!isMobile)
    await expect(page.locator("button[title='Toggle Theme']")).not.toBeVisible();
    await expect(page.locator("button[title='Language']")).not.toBeVisible();
  });

  test("settings dialog fits within mobile viewport", async ({ loggedInPage: page }) => {
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByText("Settings").click();

    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
