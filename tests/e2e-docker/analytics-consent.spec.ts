import { expect, test } from "@playwright/test";

// ─── Analytics Consent Page Flow ────────────────────────────────────
// These tests run against a Docker container at localhost:1349.
// The container must be started with SKIP_MUST_CHANGE_PASSWORD=true.
// The analytics consent screen still appears after login for fresh users.

/**
 * Helper: login with admin/admin and return the page (no saved auth state).
 * This gives us a "fresh" session where the consent screen hasn't been dismissed.
 */
async function loginFresh(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();
}

test.describe("Analytics consent page", () => {
  // Use a fresh browser context per test — no saved auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test("consent page appears for fresh users after login", async ({ page }) => {
    await loginFresh(page);

    // After login, the AuthGuard should redirect to /analytics-consent
    await page.waitForURL("**/analytics-consent", { timeout: 30_000 });
    await expect(page).toHaveURL("/analytics-consent");

    // Verify consent page content
    await expect(page.getByText("Make ashim better for you")).toBeVisible({ timeout: 10_000 });

    // Shield icon is rendered via Lucide — verify it exists as an SVG
    const shieldIcon = page.locator("svg.lucide-shield");
    await expect(shieldIcon).toBeVisible({ timeout: 5_000 });

    // Both action buttons should be visible
    await expect(page.getByRole("button", { name: "Sure, sounds good" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Maybe later" })).toBeVisible();

    // Verify the two columns
    await expect(page.getByText("What's shared:")).toBeVisible();
    await expect(page.getByText("What NEVER leaves your machine:")).toBeVisible();
  });

  test("accept analytics redirects to home and does not show consent again", async ({ page }) => {
    await loginFresh(page);
    await page.waitForURL("**/analytics-consent", { timeout: 30_000 });

    // Click accept
    await page.getByRole("button", { name: "Sure, sounds good" }).click();

    // Should redirect to home
    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");

    // Navigate away and back — consent page should NOT reappear
    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL("/");
    await expect(page).not.toHaveURL(/analytics-consent/);
  });

  test("decline (Maybe later) redirects to home and does not show consent again immediately", async ({
    page,
  }) => {
    await loginFresh(page);
    await page.waitForURL("**/analytics-consent", { timeout: 30_000 });

    // Click decline
    await page.getByRole("button", { name: "Maybe later" }).click();

    // Should redirect to home
    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");

    // Navigate away and back — consent page should NOT reappear (until 7 days)
    await page.goto("/resize");
    await page.waitForTimeout(2_000);
    await page.goto("/");
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL("/");
    await expect(page).not.toHaveURL(/analytics-consent/);
  });

  test("settings toggle works after accepting analytics", async ({ page }) => {
    await loginFresh(page);
    await page.waitForURL("**/analytics-consent", { timeout: 30_000 });

    // Accept analytics first
    await page.getByRole("button", { name: "Sure, sounds good" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Open Settings dialog
    const settingsButton = page
      .getByRole("button", { name: /settings/i })
      .or(page.locator("button[aria-label*='ettings']"));
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();

    // Navigate to Product Analytics section in the settings nav
    const analyticsNav = page.getByText("Product Analytics");
    await expect(analyticsNav).toBeVisible({ timeout: 5_000 });
    await analyticsNav.click();

    // Verify toggle shows enabled state
    await expect(page.getByText("Analytics enabled")).toBeVisible({ timeout: 5_000 });

    // Find and click the toggle button to disable
    const toggleButton = page.locator(
      "button.rounded-full[class*='bg-primary'], button[class*='rounded-full'][class*='bg-']",
    );
    await toggleButton.click();

    // Verify it now shows disabled
    await expect(page.getByText("Analytics disabled")).toBeVisible({ timeout: 5_000 });

    // Toggle back on
    await toggleButton.click();
    await expect(page.getByText("Analytics enabled")).toBeVisible({ timeout: 5_000 });
  });
});
