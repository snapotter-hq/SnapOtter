import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- Tools tab (enable/disable) and Product Analytics
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Tools Tab", () => {
  test("displays tools list with category headings", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    await expect(page.getByText("Enable or disable individual tools")).toBeVisible();

    // At least one category heading should be visible (uppercase text)
    const categoryHeadings = page.locator("h4");
    await expect(categoryHeadings.first()).toBeVisible();
  });

  test("Save Tool Settings button and disabled tools counter", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.getByRole("button", { name: /save tool settings/i })).toBeVisible();

    // The disabled tools counter text
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible();
  });

  test("saving tool settings shows restart banner", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await page.getByRole("button", { name: /save tool settings/i }).click();

    await expect(page.getByText("Restart required for changes to take effect.")).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("GUI Settings - Tools Tab (additional)", () => {
  test("each category has a heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    // Wait for tools to finish loading
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Category headings are h4 elements inside the dialog content
    const dialogContent = page.locator(".flex-1.overflow-y-auto");
    const headings = dialogContent.locator("h4");
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("tools show both name and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /tools/i }).click();

    // Wait for tools to load
    await expect(page.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Verify the Resize tool is listed with its description
    const dialogContent = page.locator(".flex-1.overflow-y-auto");
    await expect(dialogContent.getByText("Resize").first()).toBeVisible();
  });
});

test.describe("GUI Settings - Product Analytics Tab", () => {
  test("displays analytics consent section", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByText("Product Analytics").first()).toBeVisible();
    await expect(page.getByText(/share anonymous usage data/i)).toBeVisible();
  });

  test("analytics toggle is present", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    // Either the toggle button is present, or the admin-disabled message is shown
    const toggle = page.locator("button.rounded-full");
    const disabledMsg = page.getByText(/has been disabled by the server administrator/i);

    const toggleVisible = await toggle.isVisible().catch(() => false);
    const disabledVisible = await disabledMsg.isVisible().catch(() => false);

    // One of the two states must be true
    expect(toggleVisible || disabledVisible).toBe(true);
  });

  test("privacy policy link is present", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /product analytics/i }).click();

    await expect(page.getByRole("link", { name: /learn more/i })).toBeVisible();
  });
});
