import { expect, test } from "@playwright/test";

// ─── Privacy Policy Page ────────────────────────────────────────────
// Tests for the /privacy page content, verifying that the updated
// privacy policy reflects the analytics feature accurately.

test.describe("Privacy policy page", () => {
  test("privacy policy page is accessible and loads", async ({ page }) => {
    await page.goto("/privacy");

    // Verify the page loads with the correct title
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Product Analytics section exists", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Product Analytics" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Your Choice section exists", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Your Choice" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Third-Party Services section exists", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Third-Party Services" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mentions PostHog and Sentry by name", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("PostHog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sentry")).toBeVisible({ timeout: 10_000 });
  });

  test("shows correct last-updated date", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("April 22, 2026")).toBeVisible({ timeout: 10_000 });
  });

  test("does NOT contain old 'No Tracking or Analytics' text", async ({ page }) => {
    await page.goto("/privacy");

    // The old privacy policy had this text — it should be gone now
    const oldText = page.getByText("No Tracking or Analytics");
    await expect(oldText).not.toBeVisible({ timeout: 5_000 });
  });

  test("back-to-app link is present", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("Back to app")).toBeVisible({ timeout: 10_000 });
  });
});
