import { expect, test } from "@playwright/test";

// ─── Analytics Disabled (ANALYTICS_ENABLED=false) ───────────────────
// These tests verify behavior when the server has ANALYTICS_ENABLED=false.
// They need a Docker container started with ANALYTICS_ENABLED=false.
//
// If the container has analytics enabled, these tests will be skipped
// automatically by checking the config endpoint first.

const BASE_URL = "http://localhost:1349";

async function loginFresh(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();
}

test.describe("Analytics disabled by server", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ request: _request }, testInfo) => {
    // Skip this suite if the container has analytics enabled
    const res = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config = await res.json();
    if (config.enabled) {
      testInfo.skip();
    }
  });

  test("config endpoint returns disabled with empty fields", async ({ request }) => {
    const res = await request.get("/api/v1/config/analytics");
    expect(res.ok()).toBeTruthy();

    const config = await res.json();
    expect(config).toEqual({
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sampleRate: 0,
      instanceId: "",
    });
  });

  test("no consent screen when analytics disabled — goes directly to home", async ({ page }) => {
    await loginFresh(page);

    // Should go directly to home, NOT to /analytics-consent
    await page.waitForURL("/", { timeout: 30_000 });
    await expect(page).toHaveURL("/");
  });

  test("no outbound network requests to PostHog or Sentry", async ({ page }) => {
    const analyticsRequests: string[] = [];

    // Intercept ALL network requests and log any that hit analytics domains
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (
        url.includes("posthog.com") ||
        url.includes("posthog") ||
        url.includes("sentry.io") ||
        url.includes("sentry") ||
        url.includes("us.i.posthog.com") ||
        url.includes("ingest.sentry.io")
      ) {
        analyticsRequests.push(url);
      }
      return route.continue();
    });

    // Login
    await loginFresh(page);
    await page.waitForURL("/", { timeout: 30_000 });

    // Navigate around
    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/compress");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);

    // Assert ZERO analytics requests
    expect(analyticsRequests).toEqual([]);
  });
});
