import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// GUI Performance: Page load budgets, SPA navigation, interaction responsiveness
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page Load Performance
// ---------------------------------------------------------------------------
test.describe("Page Load Performance", () => {
  test("home page loads within budget (DOMContentLoaded < 2000ms)", async ({
    loggedInPage: page,
  }) => {
    // Navigate away first so we can measure a fresh load
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });

  test("home page navigation timing via Performance API (DOMContentLoaded < 2000ms)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("about:blank");
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      };
    });

    expect(timing.domContentLoaded).toBeLessThan(2000);
  });

  test("home page navigation timing (FCP proxy < 2000ms)", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const perfEntries = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadComplete: nav.loadEventEnd - nav.startTime,
        domInteractive: nav.domInteractive - nav.startTime,
      };
    });

    expect(perfEntries.domContentLoaded).toBeLessThan(2000);
    expect(perfEntries.domInteractive).toBeLessThan(2000);
  });

  test("tool page loads within budget (DOMContentLoaded < 2000ms)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/resize");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// SPA Navigation Timing
// ---------------------------------------------------------------------------
test.describe("SPA Navigation Timing", () => {
  test("SPA navigation from home to tool completes under 1000ms (warmed)", async ({
    loggedInPage: page,
  }) => {
    // Warm up by visiting the target page first so modules are cached
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");
    const navTime = Date.now() - start;

    // 1000ms budget for dev mode (500ms would be the production target)
    expect(navTime).toBeLessThan(1000);
  });

  test("navigate from / to /resize completes within 2000ms", async ({ loggedInPage: page }) => {
    // Start on home page and wait for it to settle
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/resize");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the tool name to appear as a signal the route rendered
    await page.locator("h2").filter({ hasText: "Resize" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("navigate from /resize to /compress completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("h2").filter({ hasText: "Compress" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("navigate from /compress to /convert completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/compress");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/convert");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("h2").filter({ hasText: "Convert" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("sidebar navigation from / to /automate completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.locator("aside").getByText("Automate").click();
    await page.waitForURL("/automate");
    await page.getByText("Pipeline Builder").waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// Settings Dialog Timing
// ---------------------------------------------------------------------------
test.describe("Settings Dialog Timing", () => {
  test("settings dialog opens within 300ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.locator("aside").getByText("Settings").click();
    await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "visible" });
    const openTime = Date.now() - start;

    expect(openTime).toBeLessThan(300);
  });

  test("settings dialog closes within 300ms", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "visible" });

    const start = Date.now();
    await page.keyboard.press("Escape");
    await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "hidden" });
    const closeTime = Date.now() - start;

    expect(closeTime).toBeLessThan(300);
  });

  test("switching settings tabs renders within 200ms", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "visible" });

    // Switch to About tab
    const start = Date.now();
    await page.getByRole("button", { name: /about/i }).click();
    await page.locator("h3").filter({ hasText: "About" }).waitFor({ state: "visible" });
    const switchTime = Date.now() - start;

    expect(switchTime).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// Interaction Responsiveness
// ---------------------------------------------------------------------------
test.describe("Interaction Responsiveness", () => {
  test("theme toggle applies within 200ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Get initial theme state
    const initialHasClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Click the theme toggle button in the footer
    const themeBtn = page.locator("button[title='Toggle Theme']");
    await expect(themeBtn).toBeVisible({ timeout: 5_000 });

    const start = Date.now();
    await themeBtn.click();

    // Wait for the dark class to toggle
    await page.waitForFunction(
      (hadDark: boolean) => document.documentElement.classList.contains("dark") !== hadDark,
      initialHasClass,
      { timeout: 200 },
    );
    const toggleTime = Date.now() - start;

    expect(toggleTime).toBeLessThan(200);

    // Toggle back to restore original state
    await themeBtn.click();
  });

  test("tool panel search filters results within 300ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    const start = Date.now();
    await searchInput.fill("resize");

    // Wait for the filtered result to be visible
    await page.getByText("Resize").first().waitFor({ state: "visible" });
    const filterTime = Date.now() - start;

    // 300ms is generous for a client-side filter
    expect(filterTime).toBeLessThan(300);
  });

  test("tool panel search clears within 300ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("resize");
    await page.waitForTimeout(200);

    const start = Date.now();
    await searchInput.fill("");

    // All categories should reappear
    await page.getByText("Essentials").first().waitFor({ state: "visible" });
    const clearTime = Date.now() - start;

    expect(clearTime).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// Bundle & Resource Efficiency
// ---------------------------------------------------------------------------
test.describe("Bundle Efficiency", () => {
  test("home page does not load excessive resources", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    // Count network requests during page load
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.resourceType() === "script" || req.resourceType() === "stylesheet") {
        requests.push(req.url());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // In dev mode Vite serves unbundled ESM modules, so count is higher
    // than production. 200 is generous for dev; production would be < 50.
    expect(requests.length).toBeLessThan(200);
  });

  test("lazy-loaded tool pages add minimal additional requests", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Track new requests when navigating to a tool page
    const newRequests: string[] = [];
    page.on("request", (req) => {
      if (req.resourceType() === "script") {
        newRequests.push(req.url());
      }
    });

    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    // In dev mode Vite serves unbundled ESM; more requests than production.
    expect(newRequests.length).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Repeated Operations Performance
// ---------------------------------------------------------------------------
test.describe("Repeated Operations Performance", () => {
  test("10 sequential tool navigations without crash", async ({ loggedInPage: page }) => {
    const routes = [
      "/resize",
      "/crop",
      "/rotate",
      "/convert",
      "/compress",
      "/sharpening",
      "/adjust-colors",
      "/strip-metadata",
      "/bulk-rename",
      "/favicon",
    ];
    const timings: number[] = [];

    // Warm up: ensure all chunks are cached
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
    }

    // Measure sequential navigations
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const route of routes) {
      const start = Date.now();
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      const elapsed = Date.now() - start;
      timings.push(elapsed);

      // Each page should render without errors
      const content = await page.textContent("body");
      expect(content).toBeDefined();
      expect(content?.length).toBeGreaterThan(0);
    }

    // Average navigation time should be under 2000ms in dev mode
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    expect(avg).toBeLessThan(2000);

    // No individual navigation should exceed 3000ms (dev mode variability)
    for (const t of timings) {
      expect(t).toBeLessThan(3000);
    }
  });

  test("20x settings dialog open/close without degradation", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const timings: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await page.locator("aside").getByText("Settings").click();
      await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "visible" });
      timings.push(Date.now() - start);

      await page.keyboard.press("Escape");
      await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "hidden" });
    }

    // All iterations should complete under budget (generous for dev/CI)
    for (const t of timings) {
      expect(t).toBeLessThan(1000);
    }

    // Last open should not be significantly slower than first
    const firstOpen = timings[0];
    const lastOpen = timings[timings.length - 1];
    expect(lastOpen).toBeLessThan(Math.max(firstOpen * 3, 1000));
  });

  test("10x upload/clear cycle stays responsive", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    const timings: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();

      // Upload
      await uploadTestImage(page);
      await expect(page.getByText(/test-image/i).first()).toBeVisible({ timeout: 5_000 });

      // Clear files
      const clearBtn = page.getByText("Clear all");
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }

      // Dropzone should reappear
      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });

      timings.push(Date.now() - start);
    }

    // No individual cycle should be excessively slow
    for (const t of timings) {
      expect(t).toBeLessThan(10_000);
    }

    // The page should still be responsive after 10 cycles
    await expect(page.locator("main")).toBeVisible();
  });
});
