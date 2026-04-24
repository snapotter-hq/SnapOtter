import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// ─── Analytics Privacy / No Data Leak ───────────────────────────────
// CRITICAL privacy tests: verify that disabling analytics means
// absolutely zero data is sent to PostHog, Sentry, or any external
// analytics domain. Also verifies that tool functionality is not
// degraded when analytics are disabled.
//
// NOTE: The auth setup project already accepted analytics consent for
// the admin user, so the consent page won't appear on login. Instead,
// these tests login, then explicitly disable analytics via the API,
// then reload the page so the store picks up the new state.

const SAMPLES_DIR = path.join(process.env.HOME ?? "/Users/sidd", "Downloads", "sample");
const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

/** Analytics-related domains to watch for in network traffic. */
const ANALYTICS_DOMAINS = [
  "posthog.com",
  "us.i.posthog.com",
  "eu.i.posthog.com",
  "sentry.io",
  "ingest.sentry.io",
  "o4508.ingest.us.sentry.io",
];

function isAnalyticsRequest(url: string): boolean {
  return ANALYTICS_DOMAINS.some((domain) => url.includes(domain));
}

async function loginFresh(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();
  // May land on "/" or "/analytics-consent" depending on user state
  try {
    const acceptBtn = page.getByRole("button", { name: /sure, sounds good/i });
    await acceptBtn.waitFor({ state: "visible", timeout: 5_000 });
    await acceptBtn.click();
    await page.waitForURL("/", { timeout: 30_000 });
  } catch {
    await page.waitForURL("/", { timeout: 30_000 });
  }
}

/**
 * Disable analytics for the admin user via the browser's existing auth token,
 * then reload so the frontend store picks up analyticsEnabled=false.
 * This avoids an extra /api/auth/login call (which counts toward rate limits).
 */
async function disableAnalytics(page: import("@playwright/test").Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const token = localStorage.getItem("snapotter-token") ?? "";
    const res = await fetch("/api/v1/user/analytics", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: false }),
    });
    return res.ok;
  });
  expect(ok, "Failed to disable analytics via in-browser API call").toBe(true);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

/**
 * Re-enable analytics for the admin user via the browser's existing auth token.
 * Called in afterEach so subsequent tests/runs start with analytics enabled.
 */
async function enableAnalytics(page: import("@playwright/test").Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      const token = localStorage.getItem("snapotter-token") ?? "";
      await fetch("/api/v1/user/analytics", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: true }),
      });
    });
  } catch {
    // Best-effort cleanup — page may already be closed
  }
}

function getFixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

async function uploadFiles(
  page: import("@playwright/test").Page,
  filePaths: string[],
): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePaths);
  await page.waitForTimeout(3_000);
}

async function waitForProcessingDone(
  page: import("@playwright/test").Page,
  timeoutMs = 60_000,
): Promise<void> {
  try {
    const spinner = page.locator("[class*='animate-spin']");
    if (await spinner.isVisible({ timeout: 3_000 })) {
      await spinner.waitFor({ state: "hidden", timeout: timeoutMs });
    }
  } catch {
    // No spinner — processing may have been instant
  }
  await page.waitForTimeout(500);
}

test.describe("No data leak after disabling analytics", () => {
  // Use fresh browser context — no saved auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  // Re-enable analytics after each test so subsequent tests/runs start clean
  test.afterEach(async ({ page }) => {
    await enableAnalytics(page);
  });

  test("zero PostHog/Sentry traffic after explicitly disabling analytics", async ({ page }) => {
    const analyticsRequests: string[] = [];

    // Login first (consent was already accepted by auth setup)
    await loginFresh(page);

    // Disable analytics via API and reload
    await disableAnalytics(page);

    // Set up network interception AFTER disabling analytics
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (isAnalyticsRequest(url)) {
        analyticsRequests.push(url);
      }
      return route.continue();
    });

    // Navigate to several pages
    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/compress");
    await page.waitForTimeout(2_000);
    await page.goto("/fullscreen");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);

    // Assert ZERO analytics requests were made
    expect(
      analyticsRequests,
      `Expected zero analytics requests, but found: ${analyticsRequests.join(", ")}`,
    ).toEqual([]);
  });

  test("zero PostHog/Sentry traffic after toggling analytics off", async ({ page }) => {
    const analyticsRequests: string[] = [];

    // Login (consent was already accepted by auth setup)
    await loginFresh(page);

    // Disable analytics via API and reload
    await disableAnalytics(page);

    // Set up network interception
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (isAnalyticsRequest(url)) {
        analyticsRequests.push(url);
      }
      return route.continue();
    });

    // Browse around
    await page.goto("/crop");
    await page.waitForTimeout(2_000);
    await page.goto("/convert");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);

    expect(
      analyticsRequests,
      `Expected zero analytics requests, but found: ${analyticsRequests.join(", ")}`,
    ).toEqual([]);
  });

  test("tool processing works normally after disabling analytics", async ({ page }) => {
    // Login and disable analytics
    await loginFresh(page);
    await disableAnalytics(page);

    // Navigate to resize tool
    await page.goto("/resize");
    await page.waitForTimeout(2_000);

    // Upload a test image
    const testImage = getFixture("test-200x150.png");
    await uploadFiles(page, [testImage]);

    // Set resize parameters
    const widthInput = page.getByLabel("Width (px)");
    await widthInput.fill("100");

    // Process the image
    const processBtn = page.getByTestId("resize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    // Verify no errors
    const error = page.locator(".text-red-500");
    expect(await error.isVisible({ timeout: 2_000 }).catch(() => false)).toBe(false);

    // Verify a download link or result appeared
    const downloadLink = page.locator(
      "a[download], a[href*='download'], button:has-text('Download')",
    );
    await expect(downloadLink.first()).toBeVisible({ timeout: 15_000 });
  });

  test("tool processing works with sample portrait after disabling analytics", async ({ page }) => {
    const portraitPath = path.join(
      SAMPLES_DIR,
      "portrait-of-a-smiling-man-with-glasses-and-a-beard-isolated.png",
    );
    if (!fs.existsSync(portraitPath)) {
      test.skip();
      return;
    }

    // Login and disable analytics
    await loginFresh(page);
    await disableAnalytics(page);

    // Navigate to resize tool
    await page.goto("/resize");
    await page.waitForTimeout(2_000);

    // Upload sample portrait
    await uploadFiles(page, [portraitPath]);

    // Set resize width
    const widthInput = page.getByLabel("Width (px)");
    await widthInput.fill("200");

    // Process
    const processBtn = page.getByTestId("resize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    // Verify no errors
    const error = page.locator(".text-red-500");
    expect(await error.isVisible({ timeout: 2_000 }).catch(() => false)).toBe(false);

    // Verify download appeared — proves functionality is not degraded
    const downloadLink = page.locator(
      "a[download], a[href*='download'], button:has-text('Download')",
    );
    await expect(downloadLink.first()).toBeVisible({ timeout: 15_000 });
  });
});
