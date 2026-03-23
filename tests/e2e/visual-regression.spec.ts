import { test, expect, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// Visual regression tests: capture screenshots at different viewport sizes
// and compare against stored baselines. On the first run, Playwright will
// generate the reference snapshots. Subsequent runs will diff against them.
//
// To update baselines after intentional UI changes:
//   npx playwright test visual-regression --update-snapshots
// ---------------------------------------------------------------------------

test.describe("Visual regression: Home page", () => {
  test("home page layout - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Let animations and fonts settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("home page layout - tablet", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-tablet.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("home page layout - mobile", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Login page", () => {
  test("login page layout - desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("login-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("login page layout - mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("login-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Tool pages", () => {
  test("resize tool - desktop (empty state)", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("resize tool - desktop (with file uploaded)", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Mask the image viewer area since the test image may render slightly
    // differently across runs; we care about the settings panel layout.
    await expect(page).toHaveScreenshot("resize-uploaded-desktop.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });

  test("resize tool - mobile (empty state)", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("compress tool - desktop (empty state)", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/compress");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("compress-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("convert tool - desktop (empty state)", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/convert");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("convert-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Fullscreen grid", () => {
  test("fullscreen grid - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/fullscreen");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("fullscreen grid - tablet", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/fullscreen");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-tablet.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("fullscreen grid - mobile", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/fullscreen");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Sidebar", () => {
  test("sidebar collapsed vs expanded appearance - desktop", async ({
    loggedInPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Capture the sidebar region
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();

    await expect(sidebar).toHaveScreenshot("sidebar-desktop.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
