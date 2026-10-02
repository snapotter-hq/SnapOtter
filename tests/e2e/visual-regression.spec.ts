import { expect, test, uploadTestImage } from "./helpers";

test.describe("Visual regression: Home page", () => {
  test("home page layout - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Let animations and fonts settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-desktop.png", {
      fullPage: false,
    });
  });

  test("home page layout - tablet", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-tablet.png", {
      fullPage: false,
    });
  });

  test("home page layout - mobile", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("home-mobile.png", {
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

    // The hero phrase rotates on a 3s timer; see gui-visual-desktop.spec.ts.
    const phrase = page.getByTestId("login-rotating-phrase");
    await expect(phrase).toBeVisible();
    await expect(page).toHaveScreenshot("login-desktop.png", {
      fullPage: false,
      mask: [phrase],
    });
  });

  test("login page layout - mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // The rotating hero phrase is hidden below lg, so there is nothing to mask.
    await expect(page.getByTestId("login-rotating-phrase")).toBeHidden();
    await expect(page).toHaveScreenshot("login-mobile.png", {
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Tool pages", () => {
  test("resize tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-desktop.png", {
      fullPage: false,
    });
  });

  test("resize tool - desktop (with file uploaded)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-uploaded-desktop.png", {
      fullPage: false,
    });
  });

  test("resize tool - mobile (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("resize-empty-mobile.png", {
      fullPage: false,
    });
  });

  test("compress tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("compress-empty-desktop.png", {
      fullPage: false,
    });
  });

  test("convert tool - desktop (empty state)", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/image/convert");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("convert-empty-desktop.png", {
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Fullscreen grid", () => {
  // 2.0 removed the /fullscreen route. The home page ("/") is now the tool
  // catalog, which is the equivalent grid view, so these capture "/".

  test("fullscreen grid - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("fullscreen-grid-desktop.png", {
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
      fullPage: false,
    });
  });
});

test.describe("Visual regression: Sidebar", () => {
  test("sidebar collapsed vs expanded appearance - desktop", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // 2.0 removed the desktop sidebar; navigation now lives in the top nav bar
    // (the <header> banner). Capture that region in place of the old sidebar.
    const nav = page.getByRole("banner").first();
    await expect(nav).toBeVisible();

    await expect(nav).toHaveScreenshot("sidebar-desktop.png");
  });
});
