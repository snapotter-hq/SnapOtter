import { expect, test, uploadTestImage } from "./helpers";

const isDocker = process.env.CI === "true" || process.env.DOCKER === "true";

test.describe("Visual regression: Home page", () => {
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");

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
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");

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
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");

  test("resize tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("resize tool - desktop (with file uploaded)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Mask the image viewer area since the test image may render slightly
    // differently across runs; we care about the settings panel layout.
    await expect(page).toHaveScreenshot("resize-uploaded-desktop.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });

  test("resize tool - mobile (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("compress tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("compress-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("convert tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/convert");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("convert-empty-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Fullscreen grid", () => {
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");

  // 2.0 removed the /fullscreen route. The home page ("/") is now the tool
  // catalog, which is the equivalent grid view, so these capture "/".

  test("fullscreen grid - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("fullscreen grid - tablet", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-tablet.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });

  test("fullscreen grid - mobile", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Sidebar", () => {
  test.skip(!isDocker, "Visual regression baselines are Docker-specific");

  test("sidebar collapsed vs expanded appearance - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // 2.0 removed the desktop sidebar; navigation now lives in the top nav bar
    // (the <header> banner). Capture that region in place of the old sidebar.
    const nav = page.getByRole("banner").first();
    await expect(nav).toBeVisible();

    await expect(nav).toHaveScreenshot("sidebar-desktop.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
