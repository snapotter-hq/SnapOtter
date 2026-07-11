import { expect, test } from "./helpers";

// The /privacy page describes the opt-out analytics model (PR #336 removed the
// old consent/opt-in flow). These assertions track the live page copy; there is
// no consent page or banner to assert anymore.

test.describe("Privacy Policy Page", () => {
  test("renders at /privacy", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("mentions PostHog as analytics provider", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    // The page legitimately mentions PostHog more than once; first() avoids a
    // strict-mode collision without weakening the presence assertion.
    await expect(page.getByText(/posthog/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("mentions Sentry as error tracking provider", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/sentry/i)).toBeVisible({ timeout: 5_000 });
  });

  test("describes local processing", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Local Processing" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/processing happens entirely on the server/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("frames analytics as opt-out, not opt-in/consent", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");
    // Analytics is on by default and can be turned off (the opt-out model).
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/can be disabled/i)).toBeVisible({ timeout: 5_000 });
    // No consent / opt-in wording should survive.
    await expect(page.getByText(/opt.?in|consent|i agree|accept analytics/i)).toHaveCount(0);
  });

  test("no auth required to access privacy page", async ({ page }) => {
    await page.goto("/privacy");
    // Should NOT redirect to login.
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/privacy");
  });
});
