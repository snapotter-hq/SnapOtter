import { expect, test } from "./helpers";

// These tests use the pre-authenticated storageState from auth.setup.ts
// where the user has already accepted analytics consent.

test.describe("Settings - Product Analytics Tab", () => {
  test("Product Analytics nav item is visible in settings", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await expect(page.getByRole("button", { name: /product analytics/i })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("clicking Product Analytics tab shows analytics section", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    // Should show the analytics description
    await expect(page.getByText(/anonymous usage data/i)).toBeVisible({ timeout: 5_000 });
  });

  test("toggle shows enabled state after accepting consent", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    // Auth setup accepted consent, so toggle should show enabled
    await expect(page.getByText(/analytics enabled/i)).toBeVisible({ timeout: 5_000 });
  });

  test("toggle off disables analytics", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    // Find and click the toggle button
    const toggleButton = page.locator("button.rounded-full");
    await toggleButton.click();

    await expect(page.getByText(/analytics disabled/i)).toBeVisible({ timeout: 5_000 });
  });

  test("toggle on re-enables analytics", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    const toggleButton = page.locator("button.rounded-full");

    // Ensure we're in disabled state first
    const text = await page.getByText(/analytics (enabled|disabled)/i).textContent();
    if (text?.toLowerCase().includes("enabled")) {
      await toggleButton.click();
      await expect(page.getByText(/analytics disabled/i)).toBeVisible({ timeout: 5_000 });
    }

    // Now toggle on
    await toggleButton.click();
    await expect(page.getByText(/analytics enabled/i)).toBeVisible({ timeout: 5_000 });
  });

  test("toggle state persists after closing and reopening settings", async ({
    loggedInPage: page,
  }) => {
    // Open settings and disable analytics
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    const toggleButton = page.locator("button.rounded-full");

    // Ensure enabled, then disable
    const text = await page.getByText(/analytics (enabled|disabled)/i).textContent();
    if (text?.toLowerCase().includes("enabled")) {
      await toggleButton.click();
      await expect(page.getByText(/analytics disabled/i)).toBeVisible({ timeout: 5_000 });
    }

    // Close dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Reopen and check the state persisted
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();
    await expect(page.getByText(/analytics disabled/i)).toBeVisible({ timeout: 5_000 });

    // Re-enable for other tests
    await toggleButton.click();
    await expect(page.getByText(/analytics enabled/i)).toBeVisible({ timeout: 5_000 });
  });

  test("privacy policy link is present", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByText(/privacy/i)).toBeVisible({ timeout: 5_000 });
  });
});
