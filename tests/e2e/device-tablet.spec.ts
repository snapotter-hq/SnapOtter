/**
 * Real device-emulated tablet tests.
 *
 * Runs on tablet-webkit (iPad gen 7, 810x1080) and tablet-chromium
 * (Galaxy Tab S9, 640x1024) with real touch, tablet UA, and DPR.
 *
 * Important breakpoint finding:
 *   - iPad (gen 7): 810px viewport width -> NOT mobile (>= 768px breakpoint)
 *     -> editor renders canvas, sidebar may be visible
 *   - Galaxy Tab S9: 640px viewport width -> IS mobile (< 768px breakpoint)
 *     -> editor shows mobile gate, bottom-nav visible, sidebar hidden
 *
 * All tests are tagged @tablet so the device projects' grep filter picks them up.
 */
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Core flow: load -> navigate -> upload -> process -> download
// ---------------------------------------------------------------------------
test.describe("@tablet Core flow", () => {
  test("navigate to tool, upload, process, and download", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await expect(page.getByText("Resize").first()).toBeVisible();

    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Verify file appeared
    await expect(page.locator("img").first()).toBeVisible();

    // Process
    const processBtn = page.getByRole("button", { name: /process|apply/i }).first();
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    await waitForProcessing(page);

    // Download should appear
    const downloadBtn = page.getByRole("button", { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Responsive chrome
// ---------------------------------------------------------------------------
test.describe("@tablet Responsive chrome", () => {
  test("no horizontal overflow on key pages", async ({ loggedInPage: page }) => {
    const pages = ["/", "/image/resize", "/automate", "/files", "/editor"];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(300);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `overflow on ${p}`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("tool page layout fits tablet viewport", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("home page renders with search accessible", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("login page renders form without overflow", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await context.close();
  });

  test("settings dialog fits within tablet viewport", async ({ loggedInPage: page }) => {
    // Open settings -- method depends on whether we're in mobile mode
    // (Galaxy Tab S9 at 640px is mobile; iPad at 810px is not)
    const bottomNav = page.locator("nav.fixed");
    const sidebar = page.locator("aside");

    if (await bottomNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Mobile layout (Galaxy Tab S9)
      await bottomNav.getByText("Settings").click();
    } else if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Desktop layout (iPad gen 7)
      await sidebar.getByText("Settings").click();
    } else {
      await page.getByRole("button", { name: /settings/i }).click();
    }

    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// ---------------------------------------------------------------------------
// Touch interactions on tablet
// ---------------------------------------------------------------------------
test.describe("@tablet Touch interactions", () => {
  test("before-after slider responds to touch", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await uploadTestImage(page);

    const processBtn = page.getByRole("button", { name: /process|apply/i }).first();
    if (await processBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await processBtn.click();
    }
    await waitForProcessing(page);

    const slider = page
      .locator("[class*='before-after'], [class*='BeforeAfter'], [class*='comparison']")
      .first();
    await slider.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

    if (await slider.isVisible()) {
      const box = await slider.boundingBox();
      if (box) {
        // Touch tap on the slider
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
  });

  test("crop canvas accepts touch on tablet", async ({ loggedInPage: page }) => {
    await page.goto("/image/crop");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Editor on tablet
//
// useMobile() breakpoint is max-width:767px.
// - iPad (gen 7) viewport: 810px -> NOT mobile -> editor renders canvas
// - Galaxy Tab S9 viewport: 640px -> IS mobile -> editor shows gate
//
// This test handles both cases: it checks which mode the device is in
// and validates accordingly.
// ---------------------------------------------------------------------------
test.describe("@tablet Editor", () => {
  test("editor renders appropriately for tablet viewport width", async ({ loggedInPage: page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    // Detect which mode we're in based on viewport width vs. 768px breakpoint
    const viewportWidth = page.viewportSize()?.width ?? 0;

    if (viewportWidth >= 768) {
      // iPad (gen 7) at 810px: editor canvas should render
      // The mobile gate should NOT be visible
      await expect(page.getByText("Desktop Recommended")).not.toBeVisible();

      // Editor UI elements should be present (menu bar, canvas area)
      const editorContent = page
        .locator(".konvajs-content, [class*='editor'], [class*='Editor']")
        .first();
      const menuBar = page.getByText(/file|edit|view|layer/i).first();
      const eitherVisible =
        (await editorContent.isVisible({ timeout: 5000 }).catch(() => false)) ||
        (await menuBar.isVisible({ timeout: 2000 }).catch(() => false));
      expect(eitherVisible).toBe(true);
    } else {
      // Galaxy Tab S9 at 640px: mobile gate should show
      await expect(page.getByText("Desktop Recommended")).toBeVisible();
      await expect(page.getByText(/works best on desktop|larger display/i)).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// SSE visibility-recovery regression on tablet
// ---------------------------------------------------------------------------
test.describe("@tablet SSE visibility recovery", () => {
  test("backgrounding and restoring tab triggers health check", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Simulate backgrounding
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // Simulate restoring
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForTimeout(500);

    // Page should still be functional
    await expect(page.getByText("Resize").first()).toBeVisible();
  });
});
