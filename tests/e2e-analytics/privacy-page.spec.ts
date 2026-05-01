import { expect, test } from "./helpers";

test.describe("Privacy Policy Page", () => {
  test("renders at /privacy", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/privacy/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("mentions PostHog as analytics provider", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/posthog/i)).toBeVisible({ timeout: 5_000 });
  });

  test("mentions Sentry as error tracking provider", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/sentry/i)).toBeVisible({ timeout: 5_000 });
  });

  test("describes local processing", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/processed locally|locally on your server/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("describes user choice for analytics", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/opt.in|your choice|consent|choose/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("no auth required to access privacy page", async ({ page }) => {
    // Use a fresh browser with no stored auth
    await page.goto("/privacy");
    // Should NOT redirect to login
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/privacy");
  });
});
