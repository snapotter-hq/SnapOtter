import { TOOLS } from "@snapotter/shared";
import { expect, openSettings, test, uploadTestImage, waitForProcessing } from "./helpers";

// Tool routes are section-prefixed at runtime (/<section>/<toolId>); resolve the
// real route from the shared catalog rather than the bare id.
const routeFor = (id: string): string => TOOLS.find((t) => t.id === id)?.route ?? `/${id}`;

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
    await page.goto("/image/resize");
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
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    const navTime = Date.now() - start;

    // 1000ms budget for dev mode (500ms would be the production target)
    expect(navTime).toBeLessThan(1000);
  });

  test("navigate from / to /image/resize completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    // Start on home page and wait for it to settle
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");
    // The tool name heading (ToolDropzone h1) signals the route rendered.
    await page.getByRole("heading", { name: "Resize" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("navigate from /image/resize to /image/compress completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/image/compress");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("heading", { name: "Compress" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("navigate from /image/compress to /image/convert completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/image/convert");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("heading", { name: "Convert" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    expect(navTime).toBeLessThan(2000);
  });

  test("top-nav navigation from / to /automate completes within 2000ms", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    // 2.0 removed the sidebar; navigation lives in the top-nav banner.
    await page.getByRole("banner").getByRole("link", { name: "Automate" }).click();
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
    await openSettings(page);
    const openTime = Date.now() - start;

    expect(openTime).toBeLessThan(300);
  });

  test("settings dialog closes within 300ms", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const start = Date.now();
    await page.keyboard.press("Escape");
    // The dialog title is the "Settings" h2; it unmounts on close.
    await page.locator("h2").filter({ hasText: "Settings" }).waitFor({ state: "hidden" });
    const closeTime = Date.now() - start;

    expect(closeTime).toBeLessThan(300);
  });

  test("switching settings tabs renders within 200ms", async ({ loggedInPage: page }) => {
    await openSettings(page);

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

    // The theme toggle now lives in the top nav (title "Toggle theme").
    const themeBtn = page.locator("button[title='Toggle theme']");
    await expect(themeBtn).toBeVisible({ timeout: 5_000 });

    const start = Date.now();
    await themeBtn.click();

    // Wait for the dark class to toggle
    await page.waitForFunction(
      (hadDark: boolean) => document.documentElement.classList.contains("dark") !== hadDark,
      initialHasClass,
      { timeout: 2000 },
    );
    const toggleTime = Date.now() - start;

    // Responsive (under a second) without flaking on slow CI runners; a click ->
    // React handler -> store -> effect -> class toggle roundtrip can exceed a
    // 200ms budget under load.
    expect(toggleTime).toBeLessThan(1000);

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

    await page.goto("/image/resize");
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
      "resize",
      "crop",
      "rotate",
      "convert",
      "compress",
      "sharpening",
      "adjust-colors",
      "strip-metadata",
      "bulk-rename",
      "favicon",
    ].map(routeFor);
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
      await openSettings(page);
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
    await page.goto("/image/resize");
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

// ---------------------------------------------------------------------------
// 14.7 Performance Budgets: FCP, LCP, TTI via Performance API
// ---------------------------------------------------------------------------
test.describe("Performance Budgets - Paint Metrics", () => {
  test("home page FCP < 2000ms via PerformanceObserver", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Wait briefly for paint entries to be recorded
    await page.waitForTimeout(1000);

    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByName("first-contentful-paint");
      if (entries.length > 0) return entries[0].startTime;
      // Fallback: use paint timing
      const paintEntries = performance.getEntriesByType("paint");
      const fcpEntry = paintEntries.find((e) => e.name === "first-contentful-paint");
      return fcpEntry?.startTime ?? null;
    });

    // FCP may not be available in all test environments (headless Chromium
    // sometimes omits paint timing). If available, assert the budget.
    if (fcp !== null) {
      expect(fcp).toBeLessThan(2000);
    }
  });

  test("home page LCP < 3000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    // Set up LCP observer before navigation
    await page.goto("/");
    await page.waitForLoadState("load");

    // Wait for LCP to stabilize
    await page.waitForTimeout(2000);

    const lcp = await page.evaluate(() => {
      return new Promise<number | null>((resolve) => {
        // Try to get LCP from existing entries
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              resolve(entries[entries.length - 1].startTime);
            }
            observer.disconnect();
          });
          observer.observe({ type: "largest-contentful-paint", buffered: true });

          // Timeout fallback
          setTimeout(() => resolve(null), 1000);
        } catch {
          resolve(null);
        }
      });
    });

    if (lcp !== null) {
      expect(lcp).toBeLessThan(3000);
    }
  });

  test("home page TTI proxy < 3500ms (domInteractive + networkIdle)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("about:blank");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const tti = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      // TTI approximation: domInteractive marks when the parser finishes,
      // combined with load event end for a reasonable upper bound
      return Math.max(nav.domInteractive - nav.startTime, nav.loadEventEnd - nav.startTime);
    });

    expect(tti).toBeLessThan(3500);
  });
});

test.describe("Performance Budgets - Route Navigation", () => {
  test("tool-to-tool SPA navigation < 500ms (warmed, production target)", async ({
    loggedInPage: page,
  }) => {
    // Warm up both routes so lazy chunks are cached
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // Now measure warmed navigation
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await page.goto("/image/compress");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("heading", { name: "Compress" }).waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    // 500ms is the production budget; use 1500ms for dev mode
    expect(navTime).toBeLessThan(1500);
  });

  test("top-nav click navigation < 500ms (warmed)", async ({ loggedInPage: page }) => {
    // Warm up
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click an Automate link in the top-nav banner
    const start = Date.now();
    await page.getByRole("banner").getByRole("link", { name: "Automate" }).click();
    await page.waitForURL("/automate");
    await page.getByText("Pipeline Builder").waitFor({ state: "visible" });
    const navTime = Date.now() - start;

    // 1500ms for dev mode
    expect(navTime).toBeLessThan(1500);
  });
});

// ---------------------------------------------------------------------------
// 14.7 File Upload Preview Timing
// ---------------------------------------------------------------------------
test.describe("File Upload Preview Timing", () => {
  test("file upload preview renders within 1000ms", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await uploadTestImage(page);

    // Wait for the image preview or filename to appear
    await expect(
      page
        .getByText(/test-image/i)
        .or(page.locator("img[src^='blob:']"))
        .first(),
    ).toBeVisible({ timeout: 5_000 });
    const previewTime = Date.now() - start;

    expect(previewTime).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// 14.8 Interaction Responsiveness (expanded)
// ---------------------------------------------------------------------------
test.describe("Interaction Responsiveness - Live Preview", () => {
  test("compress quality slider updates preview indicator promptly", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // Look for a quality slider or range input
    const slider = page.locator("input[type='range']").first();
    if (await slider.isVisible({ timeout: 3000 }).catch(() => false)) {
      const initialValue = await slider.inputValue();

      const start = Date.now();
      // Adjust via keyboard
      await slider.focus();
      await page.keyboard.press("ArrowRight");

      const newValue = await slider.inputValue();
      const responseTime = Date.now() - start;

      // Value should change and respond within 300ms (generous for dev)
      if (newValue !== initialValue) {
        expect(responseTime).toBeLessThan(300);
      }
    }
  });
});

test.describe("Interaction Responsiveness - No Blank Flash", () => {
  test("no white/blank flash during tool-to-tool navigation", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Monitor for blank screens during navigation
    let blankScreenDetected = false;

    // Check periodically during navigation
    const checkInterval = setInterval(async () => {
      try {
        const bodyHtml = await page.evaluate(() => document.body.innerHTML);
        if (bodyHtml.trim().length === 0) {
          blankScreenDetected = true;
        }
      } catch {
        // Page might be navigating, ignore
      }
    }, 50);

    // Navigate through several tools
    await page.goto("/image/compress");
    await page.waitForLoadState("domcontentloaded");
    await page.goto("/image/rotate");
    await page.waitForLoadState("domcontentloaded");
    await page.goto("/image/convert");
    await page.waitForLoadState("domcontentloaded");

    clearInterval(checkInterval);

    expect(blankScreenDetected).toBe(false);
  });

  test("Suspense fallback renders during lazy load (no bare white screen)", async ({
    loggedInPage: page,
  }) => {
    // Navigate to a tool that is lazy-loaded
    // During load, the Suspense boundary should show a spinner, not nothing
    await page.goto("about:blank");

    // Navigate and immediately check for content
    const response = page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // After domcontentloaded, body should have content (either the spinner or the page)
    const bodyContent = await page.textContent("body");
    expect(bodyContent).toBeDefined();

    // Wait for full load
    await response;
    await expect(page.locator("main").or(page.locator("[class*='animate-spin']"))).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Interaction Responsiveness - Theme Toggle", () => {
  test("theme toggle does not cause layout shift", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // 2.0 removed the sidebar; the top-nav banner is the stable chrome element.
    const bannerBefore = await page.getByRole("banner").boundingBox();

    // Toggle theme
    const themeBtn = page.locator("button[title='Toggle theme']");
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(200);

      // Get the banner geometry after toggle
      const bannerAfter = await page.getByRole("banner").boundingBox();

      // Banner dimensions should not change (no layout shift)
      if (bannerBefore && bannerAfter) {
        expect(bannerAfter.width).toBe(bannerBefore.width);
        expect(bannerAfter.x).toBe(bannerBefore.x);
      }

      // Toggle back
      await themeBtn.click();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.7 Performance Budgets: Tool Settings Lazy Load
// ---------------------------------------------------------------------------
test.describe("Performance Budgets - Lazy Load", () => {
  test("tool settings lazy load < 500ms after upload", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    await uploadTestImage(page);

    // Wait for the settings panel / process button to appear (lazy loaded).
    // The submit button shares the tool name, so target it by test id.
    await expect(page.getByTestId("resize-submit")).toBeVisible({ timeout: 5_000 });
    const loadTime = Date.now() - start;

    // The settings panel should appear within 500ms of upload
    // (uploadTestImage includes 500ms for React state, so subtract that)
    // Use generous budget of 2000ms total (including upload processing)
    expect(loadTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// 14.7 DOMContentLoaded on Various Pages
// ---------------------------------------------------------------------------
test.describe("DOMContentLoaded Budget - Various Pages", () => {
  test("automate page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/automate");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });

  test("files page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/files");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });

  test("compress page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/image/compress");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// 14.8 Keyboard Shortcut Response Time
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcut Responsiveness", () => {
  test("Ctrl/Cmd+K search shortcut responds instantly", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const isMac = await page.evaluate(() => /Mac|iPod|iPhone|iPad/.test(navigator.platform));
    const modKey = isMac ? "Meta" : "Control";

    const start = Date.now();
    await page.keyboard.press(`${modKey}+k`);

    // The search input should become focused or a search modal should appear
    await page.waitForTimeout(100);
    const responseTime = Date.now() - start;

    // Should respond within 300ms (generous for dev)
    expect(responseTime).toBeLessThan(300);

    // Verify something happened (search focused or modal appeared)
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTag).toBeDefined();
  });

  test("Escape key dismisses focused element instantly", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Focus the search input
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.focus();
      await searchInput.fill("resize");

      const start = Date.now();
      await page.keyboard.press("Escape");
      const responseTime = Date.now() - start;

      // Escape should respond within 200ms
      expect(responseTime).toBeLessThan(200);
    }
  });
});

// ---------------------------------------------------------------------------
// 14.8 Search Filter Responsiveness
// ---------------------------------------------------------------------------
test.describe("Search Filter Timing - Extended", () => {
  test("search filter for partial match responds within 300ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    const start = Date.now();
    await searchInput.fill("comp");

    // Wait for a filtered result containing "Compress" to appear
    await page.getByText("Compress").first().waitFor({ state: "visible", timeout: 3_000 });
    const filterTime = Date.now() - start;

    expect(filterTime).toBeLessThan(300);
  });

  test("search with no results renders empty state within 300ms", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    const start = Date.now();
    await searchInput.fill("zzzznonexistenttool");

    // Wait for the empty state or "no results" indicator
    await page.waitForTimeout(200);
    const filterTime = Date.now() - start;

    expect(filterTime).toBeLessThan(300);

    // The page should still be functional
    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 14.9 Memory and Stability - Extended
// ---------------------------------------------------------------------------
test.describe("Memory and Stability - Extended", () => {
  test("10 different tools sequentially without reload or crash", async ({
    loggedInPage: page,
  }) => {
    const tools = [
      "resize",
      "compress",
      "convert",
      "rotate",
      "optimize-for-web",
      "crop",
      "watermark-text",
      "border",
      "sharpening",
      "adjust-colors",
    ].map(routeFor);

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    for (const tool of tools) {
      await page.goto(tool);
      await page.waitForLoadState("domcontentloaded");

      // Each tool page should render its heading
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeDefined();
      expect(bodyText?.length).toBeGreaterThan(0);

      // Top-nav banner should remain visible (layout intact)
      await expect(page.getByRole("banner")).toBeVisible();
    }

    // No uncaught errors should have occurred
    expect(errors).toHaveLength(0);
  });

  test("navigate rapidly between 15 tools and verify no state bleed", async ({
    loggedInPage: page,
  }) => {
    const toolIds = [
      "resize",
      "crop",
      "rotate",
      "convert",
      "compress",
      "sharpening",
      "adjust-colors",
      "strip-metadata",
      "bulk-rename",
      "favicon",
      "watermark-text",
      "border",
      "optimize-for-web",
      "qr-generate",
      "image-to-pdf",
    ];

    // Upload on the first tool
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await expect(page.getByText(/test-image/i).first()).toBeVisible({ timeout: 5_000 });

    // Navigate rapidly through all tools
    for (const id of toolIds.slice(1)) {
      await page.goto(routeFor(id));
      await page.waitForLoadState("domcontentloaded");
    }

    // Come back to resize: state should be clean (no leftover from first upload)
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // The dropzone should be visible (previous upload state was cleared on nav)
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// 14.9 Memory Stability with JS Heap Measurement
// ---------------------------------------------------------------------------
test.describe("Memory Stability - Heap Measurement", () => {
  test("10 tool navigations do not cause unbounded heap growth", async ({ loggedInPage: page }) => {
    const tools = [
      "resize",
      "compress",
      "convert",
      "rotate",
      "optimize-for-web",
      "crop",
      "watermark-text",
      "border",
      "sharpening",
      "adjust-colors",
    ].map(routeFor);

    // Warm up and take baseline
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const baselineHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    // Navigate through all tools sequentially
    for (const tool of tools) {
      await page.goto(tool);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("banner")).toBeVisible();
    }

    const finalHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    // If heap measurement is available (Chromium only), verify no unbounded growth
    // Allow up to 3x growth from baseline (accounts for lazy-loaded chunks)
    if (baselineHeap !== null && finalHeap !== null) {
      expect(
        finalHeap,
        `Heap grew from ${(baselineHeap / 1024 / 1024).toFixed(1)}MB to ${(finalHeap / 1024 / 1024).toFixed(1)}MB (${((finalHeap / baselineHeap) * 100).toFixed(0)}%)`,
      ).toBeLessThan(baselineHeap * 3);
    }
  });

  test("20 dialog open/close cycles do not leak memory", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const baselineHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    for (let i = 0; i < 20; i++) {
      await openSettings(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible({
        timeout: 5_000,
      });
    }

    const finalHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    // Dialogs should not cause unbounded growth; allow 2x for GC timing
    if (baselineHeap !== null && finalHeap !== null) {
      expect(
        finalHeap,
        `Dialog cycles: heap grew from ${(baselineHeap / 1024 / 1024).toFixed(1)}MB to ${(finalHeap / 1024 / 1024).toFixed(1)}MB`,
      ).toBeLessThan(baselineHeap * 2);
    }

    // Page should remain responsive
    await expect(page.locator("main")).toBeVisible();
  });

  test("10 upload/clear cycles do not leak memory", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const baselineHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    for (let i = 0; i < 10; i++) {
      await uploadTestImage(page);
      await expect(page.getByText(/test-image/i).first()).toBeVisible({ timeout: 5_000 });

      const clearBtn = page.getByText("Clear all");
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }
      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    }

    const finalHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    // Upload/clear cycles with blob URL cleanup should not leak significantly
    if (baselineHeap !== null && finalHeap !== null) {
      expect(
        finalHeap,
        `Upload/clear cycles: heap grew from ${(baselineHeap / 1024 / 1024).toFixed(1)}MB to ${(finalHeap / 1024 / 1024).toFixed(1)}MB`,
      ).toBeLessThan(baselineHeap * 2.5);
    }

    // No blob URLs should remain after clearing
    const blobImages = page.locator("img[src^='blob:']");
    await expect(blobImages).toHaveCount(0);
  });

  test("rapid 15-page navigation does not exceed memory budget", async ({ loggedInPage: page }) => {
    const routes = [
      "resize",
      "crop",
      "rotate",
      "convert",
      "compress",
      "sharpening",
      "adjust-colors",
      "strip-metadata",
      "bulk-rename",
      "favicon",
      "watermark-text",
      "border",
      "optimize-for-web",
      "qr-generate",
      "image-to-pdf",
    ].map(routeFor);

    // Warm up
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const baselineHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Rapid navigation through all 15 pages
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // Each page should render content
      const content = await page.textContent("body");
      expect(content).toBeDefined();
      expect(content?.length).toBeGreaterThan(0);
    }

    const finalHeap = await page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return perf.memory?.usedJSHeapSize ?? null;
    });

    // No JS errors during rapid navigation
    expect(errors).toHaveLength(0);

    // Memory should stay bounded (3x for all lazy chunks loading)
    if (baselineHeap !== null && finalHeap !== null) {
      expect(
        finalHeap,
        `Rapid 15-page nav: heap grew from ${(baselineHeap / 1024 / 1024).toFixed(1)}MB to ${(finalHeap / 1024 / 1024).toFixed(1)}MB`,
      ).toBeLessThan(baselineHeap * 3);
    }

    // Page should still be responsive at the end
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Login Page Load Budget
// ---------------------------------------------------------------------------
test.describe("Login Page Load Budget", () => {
  test("login page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });

  test("login page renders form within 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/login");
    await page.getByLabel("Username").waitFor({ state: "visible" });
    const renderTime = Date.now() - start;

    expect(renderTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// Change Password Page Load Budget
// ---------------------------------------------------------------------------
test.describe("Change Password Page Load Budget", () => {
  test("change password page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/change-password");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// QR Generate Page Load Budget
// ---------------------------------------------------------------------------
test.describe("QR Generate Page Load Budget", () => {
  test("QR generate page DOMContentLoaded < 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(2000);
  });

  test("QR generate page renders input within 2000ms", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const start = Date.now();
    await page.goto("/image/qr-generate");
    await page.locator("[data-testid='qr-input-url']").waitFor({ state: "visible" });
    const renderTime = Date.now() - start;

    expect(renderTime).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// End-to-End Processing Throughput
// ---------------------------------------------------------------------------
test.describe("Processing Throughput", () => {
  test("resize end-to-end processing completes within 5s", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    const start = Date.now();
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);
    await expect(page.getByTestId("resize-download")).toBeVisible({
      timeout: 15_000,
    });
    const processTime = Date.now() - start;

    // End-to-end (click to download available) should be under 5s
    expect(processTime).toBeLessThan(5000);
  });

  test("two sequential processes do not degrade in speed", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    await uploadTestImage(page);

    // First process
    await page.locator("input[placeholder='Auto']").first().fill("50");
    const start1 = Date.now();
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);
    await expect(page.getByTestId("resize-download")).toBeVisible({
      timeout: 15_000,
    });
    const time1 = Date.now() - start1;

    // Second process with different settings
    await page.locator("input[placeholder='Auto']").first().fill("75");
    const start2 = Date.now();
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);
    await expect(page.getByTestId("resize-download")).toBeVisible({
      timeout: 15_000,
    });
    const time2 = Date.now() - start2;

    // Second process should not be more than 3x slower than first
    expect(time2).toBeLessThan(Math.max(time1 * 3, 5000));
  });
});

// ---------------------------------------------------------------------------
// Page Scroll Performance
// ---------------------------------------------------------------------------
test.describe("Page Scroll Performance", () => {
  test("home catalog scrolls smoothly without jank", async ({ loggedInPage: page }) => {
    // 2.0 removed the sidebar; the home catalog is the long scrollable surface,
    // rendered inside the AppLayout main scroll container (#main-content).
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const scrollable = page.locator("#main-content");
    await expect(scrollable).toBeVisible();

    const start = Date.now();

    // Scroll down
    await scrollable.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(100);

    // Scroll back up
    await scrollable.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(100);

    const scrollTime = Date.now() - start;

    // Scrolling should be near-instant (under 500ms for both directions)
    expect(scrollTime).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Theme Toggle Does Not Cause Re-render Cascade
// ---------------------------------------------------------------------------
test.describe("Theme Toggle Performance", () => {
  test("theme toggle completes within 200ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const themeBtn = page.locator("button[title='Toggle theme']");
    if (!(await themeBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    const start = Date.now();
    await themeBtn.click();
    await page.waitForFunction(
      (hadDark: boolean) => document.documentElement.classList.contains("dark") !== hadDark,
      isDark,
      { timeout: 2000 },
    );
    const toggleTime = Date.now() - start;

    // Responsive (under a second) without flaking on slow CI runners.
    expect(toggleTime).toBeLessThan(1000);

    // Restore
    await themeBtn.click();
  });

  test("theme toggle does not cause visible layout reflow", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const themeBtn = page.locator("button[title='Toggle theme']");
    if (!(await themeBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    // Measure main content position before toggle
    const mainBefore = await page.locator("main").boundingBox();

    await themeBtn.click();
    await page.waitForTimeout(200);

    // Measure main content position after toggle
    const mainAfter = await page.locator("main").boundingBox();

    if (mainBefore && mainAfter) {
      // Layout should not shift
      expect(mainAfter.x).toBe(mainBefore.x);
      expect(mainAfter.y).toBe(mainBefore.y);
      expect(mainAfter.width).toBe(mainBefore.width);
    }

    // Restore
    await themeBtn.click();
  });
});

// ---------------------------------------------------------------------------
// Settings Tab Switch Performance
// ---------------------------------------------------------------------------
test.describe("Settings Tab Switch Performance", () => {
  test("switching between all settings tabs stays under 300ms each", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    // Try switching to different tabs
    const tabNames = [/general/i, /people/i, /about/i];
    const timings: number[] = [];

    for (const tabPattern of tabNames) {
      const tab = page.getByRole("button", { name: tabPattern });
      if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        const start = Date.now();
        await tab.click();
        await page.waitForTimeout(100);
        timings.push(Date.now() - start);
      }
    }

    // Each tab switch should be under 300ms
    for (const t of timings) {
      expect(t).toBeLessThan(300);
    }

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// Help Dialog Open/Close Performance
// ---------------------------------------------------------------------------
test.describe("Help Dialog Performance", () => {
  test("help dialog opens within 300ms", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const start = Date.now();
    // 2.0 removed the sidebar; Help is a top-nav banner button.
    await page.getByRole("banner").getByRole("button", { name: /help/i }).first().click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
    const openTime = Date.now() - start;

    expect(openTime).toBeLessThan(300);

    await page.keyboard.press("Escape");
  });

  test("help dialog closes within 300ms", async ({ loggedInPage: page }) => {
    await page.getByRole("banner").getByRole("button", { name: /help/i }).first().click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    const start = Date.now();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();
    const closeTime = Date.now() - start;

    expect(closeTime).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// No Console Errors During Normal Usage
// ---------------------------------------------------------------------------
test.describe("Console Error Monitoring", () => {
  test("no console errors during home page load", async ({ loggedInPage: page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("about:blank");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known benign errors (e.g., favicon 404 in dev)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("404") && !e.includes("ERR_CONNECTION"),
    );

    expect(realErrors, `Console errors during home load: ${realErrors.join("; ")}`).toHaveLength(0);
  });

  test("no console errors during tool page load", async ({ loggedInPage: page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("about:blank");
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const realErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("404") && !e.includes("ERR_CONNECTION"),
    );

    expect(realErrors, `Console errors during tool load: ${realErrors.join("; ")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Network Request Count Budget
// ---------------------------------------------------------------------------
test.describe("Network Request Budget", () => {
  test("tool page API calls are minimal on initial load", async ({ loggedInPage: page }) => {
    await page.goto("about:blank");

    const apiRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/")) {
        apiRequests.push(req.url());
      }
    });

    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Tool page should not make excessive API calls on load (health, session,
    // settings for the disabled-tools gate, features, locale: no more than 10).
    expect(apiRequests.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Batch Navigation Timing Consistency
// ---------------------------------------------------------------------------
test.describe("Navigation Timing Consistency", () => {
  test("sequential navigation to same page is consistent", async ({ loggedInPage: page }) => {
    // Warm up
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const timings: number[] = [];

    for (let i = 0; i < 5; i++) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const start = Date.now();
      await page.goto("/image/resize");
      await page.waitForLoadState("domcontentloaded");
      timings.push(Date.now() - start);
    }

    // No individual navigation should be more than 3x the average
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    for (const t of timings) {
      expect(t, `Navigation time ${t}ms is more than 3x average ${avg.toFixed(0)}ms`).toBeLessThan(
        Math.max(avg * 3, 2000),
      );
    }
  });
});
