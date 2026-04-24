import { expect, test } from "@playwright/test";

// ─── Analytics Consent Page Flow ────────────────────────────────────
// These tests run against a Docker container at localhost:1349.
// The container must be started with SKIP_MUST_CHANGE_PASSWORD=true.
//
// IMPORTANT: There is only one admin user in the DB. Once consent is
// given/declined, the user's state changes. Tests run serially and
// each builds on the state left by the previous test.

async function loginAndGetToHome(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin");
  await page.getByRole("button", { name: /login/i }).click();
  // May hit consent page or go straight to home
  try {
    const acceptBtn = page.getByRole("button", { name: /sure, sounds good/i });
    await acceptBtn.waitFor({ state: "visible", timeout: 5_000 });
    await acceptBtn.click();
    await page.waitForURL("/", { timeout: 30_000 });
  } catch {
    await page.waitForURL("/", { timeout: 30_000 });
  }
}

test.describe("Analytics consent page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  test("consent already accepted by auth setup — home loads without consent redirect", async ({
    page,
  }) => {
    // The auth setup project already accepted analytics consent for the admin
    // user, so a fresh browser session logging in as admin should go straight
    // to the home page without being redirected to /analytics-consent.
    await loginAndGetToHome(page);
    await expect(page).toHaveURL("/");

    // Navigate away and back — consent page should NOT reappear
    await page.goto("/resize");
    await page.waitForTimeout(1_000);
    await page.goto("/");
    await page.waitForTimeout(1_000);
    await expect(page).not.toHaveURL(/analytics-consent/);

    // Verify session has analyticsEnabled=true via API (using the in-browser token)
    const sessionData = await page.evaluate(async () => {
      const token = localStorage.getItem("snapotter-token") ?? "";
      const res = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    });
    expect(sessionData.user.analyticsEnabled).toBe(true);
    expect(sessionData.user.analyticsConsentShownAt).toBeGreaterThan(0);
  });

  test("settings toggle works after accepting analytics", async ({ page }) => {
    // User already accepted in previous test — login should go straight to home
    await loginAndGetToHome(page);
    await expect(page).toHaveURL("/");

    // Open Settings dialog — look for the gear icon or settings button
    const settingsButton = page
      .locator("[data-testid='settings-button']")
      .or(page.locator("button").filter({ has: page.locator("svg.lucide-settings") }));
    await expect(settingsButton.first()).toBeVisible({ timeout: 10_000 });
    await settingsButton.first().click();

    // Navigate to Product Analytics section in the settings nav
    const analyticsNav = page.getByText("Product Analytics");
    await expect(analyticsNav).toBeVisible({ timeout: 5_000 });
    await analyticsNav.click();

    // Verify toggle shows enabled state
    await expect(page.getByText("Analytics enabled")).toBeVisible({ timeout: 5_000 });

    // Click the toggle button to disable
    const toggleButton = page.locator("button.rounded-full");
    await toggleButton.click();
    await expect(page.getByText("Analytics disabled")).toBeVisible({ timeout: 5_000 });

    // Toggle back on
    await toggleButton.click();
    await expect(page.getByText("Analytics enabled")).toBeVisible({ timeout: 5_000 });
  });
});
