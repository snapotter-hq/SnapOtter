import path from "node:path";
import { expect, test } from "@playwright/test";

// Verifies that when analytics is disabled at build time, zero data
// is sent to PostHog or Sentry, and tool functionality is unaffected.

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");
// biome-ignore lint/suspicious/noUndeclaredEnvVars: e2e test env var
const BASE_URL = process.env.API_URL ?? "http://localhost:1349";

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
  await page.waitForURL("/", { timeout: 30_000 });
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
    // No spinner
  }
  await page.waitForTimeout(500);
}

test.describe("No data leak when analytics disabled", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ request: _request }, testInfo) => {
    // Skip if this build has analytics enabled
    const res = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config = await res.json();
    if (config.enabled) {
      testInfo.skip();
    }
  });

  test("zero PostHog/Sentry traffic when analytics disabled", async ({ page }) => {
    const analyticsRequests: string[] = [];

    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (isAnalyticsRequest(url)) {
        analyticsRequests.push(url);
      }
      return route.continue();
    });

    await loginFresh(page);

    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/compress");
    await page.waitForTimeout(2_000);
    await page.goto("/fullscreen");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);

    expect(
      analyticsRequests,
      `Expected zero analytics requests, but found: ${analyticsRequests.join(", ")}`,
    ).toEqual([]);
  });

  test("tool processing works when analytics disabled", async ({ page }) => {
    await loginFresh(page);

    await page.goto("/resize");
    await page.waitForTimeout(2_000);

    const testImage = getFixture("test-200x150.png");
    await uploadFiles(page, [testImage]);

    const widthInput = page.getByLabel("Width (px)");
    await widthInput.fill("100");

    const processBtn = page.getByTestId("resize-submit");
    await expect(processBtn).toBeEnabled({ timeout: 15_000 });
    await processBtn.click();
    await waitForProcessingDone(page);

    const error = page.locator(".text-destructive-ink, .text-red-500");
    expect(await error.isVisible({ timeout: 2_000 }).catch(() => false)).toBe(false);

    const downloadLink = page.locator(
      "a[download], a[href*='download'], button:has-text('Download')",
    );
    await expect(downloadLink.first()).toBeVisible({ timeout: 15_000 });
  });
});
