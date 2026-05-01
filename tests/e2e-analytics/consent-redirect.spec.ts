import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Tests the AuthGuard redirect behavior: fresh users get redirected
// to /analytics-consent, accepted users do not.

test.describe("Consent Redirect - Fresh User", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/analytics-consent is accessible directly", async ({ page }) => {
    await page.goto("/analytics-consent");
    // Page should load (may auto-decline if config not yet loaded, but no crash)
    await page.waitForTimeout(2000);
    // No error page or blank screen
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
  });

  test("/privacy is accessible without auth", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/privacy");
    await expect(page.getByText(/privacy/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("navigating to a protected route without auth redirects to /login", async ({ page }) => {
    await page.goto("/resize");
    await page.waitForURL(/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Consent Redirect - Accepted User", () => {
  // Uses the pre-authenticated storageState where consent was accepted

  test("home page loads without consent redirect", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("analytics-consent");
  });

  test("tool page loads without consent redirect", async ({ page }) => {
    await page.goto("/resize");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("analytics-consent");
    expect(page.url()).toContain("/resize");
  });

  test("automate page loads without consent redirect", async ({ page }) => {
    await page.goto("/automate");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("analytics-consent");
  });

  test("navigating between pages never triggers consent redirect", async ({ page }) => {
    const pages = ["/", "/resize", "/fullscreen", "/automate", "/"];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain("analytics-consent");
    }
  });
});
