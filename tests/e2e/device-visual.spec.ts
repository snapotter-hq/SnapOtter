/**
 * Device visual regression -- small, curated set.
 *
 * Screenshots a few key pages on mobile-chromium (Pixel 7) and
 * tablet-chromium (Galaxy Tab S9). Uses toHaveScreenshot with
 * platform-suffixed baselines (darwin locally, linux via CI workflow).
 *
 * Tagged @mobile / @tablet so device projects' grep filter picks them up.
 * Matched by DEVICE_SPECS for project routing.
 */
import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Mobile (Pixel 7 -- mobile-chromium)
// ---------------------------------------------------------------------------
test.describe("@mobile @visual Device visual regression", () => {
  test("home page", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-home-mobile.png", {
      fullPage: false,
    });
  });

  test("tool page -- image resize (empty state)", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-resize-mobile.png", {
      fullPage: false,
    });
  });

  test("settings dialog", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await openSettings(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-settings-mobile.png", {
      fullPage: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Tablet (Galaxy Tab S9 -- tablet-chromium)
// ---------------------------------------------------------------------------
test.describe("@tablet @visual Device visual regression", () => {
  test("home page", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-home-tablet.png", {
      fullPage: false,
    });
  });

  test("tool page -- image resize (empty state)", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-resize-tablet.png", {
      fullPage: false,
    });
  });

  test("settings dialog", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await openSettings(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("device-settings-tablet.png", {
      fullPage: false,
    });
  });
});
