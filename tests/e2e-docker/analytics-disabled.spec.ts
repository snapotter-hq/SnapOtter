import { expect, test } from "@playwright/test";

// Tests for behavior when analytics is disabled at build time.
// Skip automatically if the container was built with analytics enabled.

// biome-ignore lint/suspicious/noUndeclaredEnvVars: e2e test env var
const BASE_URL = process.env.API_URL ?? "http://localhost:1349";

async function loginFresh(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();
}

test.describe("Analytics disabled by build-time config", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ request: _request }, testInfo) => {
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
      sentryDsnWeb: "",
      posthogSampleRate: 0,
      instanceId: "",
    });
  });

  test("login goes directly to home (no consent screen)", async ({ page }) => {
    await loginFresh(page);
    await page.waitForURL("/", { timeout: 30_000 });
    await expect(page).toHaveURL("/");
  });

  test("no outbound network requests to PostHog or Sentry", async ({ page }) => {
    const analyticsRequests: string[] = [];

    await page.route("**/*", (route) => {
      const url = route.request().url();
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        // non-URL scheme
      }
      if (
        host === "posthog.com" ||
        host.endsWith(".posthog.com") ||
        host === "sentry.io" ||
        host.endsWith(".sentry.io")
      ) {
        analyticsRequests.push(url);
      }
      return route.continue();
    });

    await loginFresh(page);
    await page.waitForURL("/", { timeout: 30_000 });

    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/compress");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);

    expect(analyticsRequests).toEqual([]);
  });
});
