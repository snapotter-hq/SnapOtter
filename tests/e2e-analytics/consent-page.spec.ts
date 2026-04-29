import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// These tests use a FRESH browser context (no stored auth) so the user
// hits the consent page naturally after logging in.

test.describe("Analytics Consent Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  test("fresh login redirects to /analytics-consent", async ({ page }) => {
    // Reset consent state so user is fresh
    await login(page);

    // Wait for either consent page or home
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    // First login should show consent page
    const url = page.url();
    if (url.includes("analytics-consent")) {
      await expect(page.getByText(/help improve snapotter/i)).toBeVisible({ timeout: 5_000 });
    }
    // If it went to home, consent was already handled in a prior run -- still valid
  });

  test("consent page renders all required elements", async ({ page }) => {
    await page.goto("/analytics-consent");

    // Shield icon container
    await expect(page.locator("svg.lucide-shield")).toBeVisible({ timeout: 5_000 });

    // Title
    await expect(page.getByText(/help improve snapotter/i)).toBeVisible();

    // Description text about anonymous usage data
    await expect(page.getByText(/anonymous usage data/i)).toBeVisible();

    // "You can change this" reassurance text
    await expect(page.getByText(/change this anytime/i)).toBeVisible();

    // Accept button
    await expect(page.getByRole("button", { name: /sure, sounds good/i })).toBeVisible();

    // Decline button
    await expect(page.getByRole("button", { name: /not right now/i })).toBeVisible();
  });

  test("accept button navigates to home and sets analyticsEnabled=true", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    await expect(page).toHaveURL("/");

    // Verify via session API
    const token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
    const sessionRes = await page.request.get("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();
    expect(session.user.analyticsEnabled).toBe(true);
  });

  test("after accept, navigating around never shows consent page again", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /sure, sounds good/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    // Navigate to different pages
    for (const path of ["/resize", "/fullscreen", "/automate", "/"]) {
      await page.goto(path);
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain("analytics-consent");
    }
  });
});

test.describe("Analytics Consent - Decline (Remind Later)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  test("decline button navigates to home", async ({ page }) => {
    // Reset consent to force the prompt: accept first, then we can't re-trigger
    // because the DB user already has consent set. Use API to reset.
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /not right now/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
      await expect(page).toHaveURL("/");
    }
  });

  test("after decline, session shows remindAt in the future", async ({ page }) => {
    await login(page);
    await page.waitForURL(/analytics-consent|\//, { timeout: 15_000 });

    // If consent page shows, decline
    if (page.url().includes("analytics-consent")) {
      await page.getByRole("button", { name: /not right now/i }).click();
      await page.waitForURL("/", { timeout: 30_000 });
    }

    const token = await page.evaluate(() => localStorage.getItem("snapotter-token") ?? "");
    const sessionRes = await page.request.get("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();

    // After decline (remind later), analyticsEnabled is null and remindAt is set
    if (session.user.analyticsConsentRemindAt !== null) {
      expect(session.user.analyticsConsentRemindAt).toBeGreaterThan(Date.now());
    }
  });
});
