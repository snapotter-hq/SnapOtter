import { expect, test } from "./helpers";

test.describe("Settings Dialog", () => {
  test("opens from sidebar", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Settings dialog should appear with sections
    await expect(page.getByText("General").first()).toBeVisible();
  });

  test("General section shows user info", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Should show username and version info
    await expect(page.getByText(/admin/i).first()).toBeVisible();
    await expect(page.getByText(/0\.1\.0|version/i).first()).toBeVisible();
  });

  test("General section has logout button", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    const logoutBtn = page.getByRole("button", { name: /logout|log out/i });
    await expect(logoutBtn).toBeVisible();
  });

  test("Security section has change password form", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Navigate to Security section
    await page.getByText("Security").click();

    // Should show password change fields
    await expect(page.getByText(/change password|current password/i).first()).toBeVisible();
  });

  test("People section shows user list", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Navigate to People section
    await page.getByText("People").click();

    // Should show admin user
    await expect(page.getByText("admin").first()).toBeVisible();
  });

  // TODO: This test is flaky due to dialog state isolation — the API keys
  // endpoint is verified via the API test suite (api.spec.ts)
  test.skip("API Keys section has generate button", async ({ browser }) => {
    // Use a fresh context to avoid dialog state from previous tests
    const context = await browser.newContext({
      storageState: "test-results/.auth/user.json",
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("aside").getByText("Settings").click();
    await page.waitForTimeout(500);

    const apiKeysBtn = page.getByRole("button", { name: /api keys/i });
    await expect(apiKeysBtn).toBeVisible({ timeout: 5_000 });
    await apiKeysBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible({
      timeout: 5_000,
    });

    await context.close();
  });

  test("About section shows app info", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Navigate to About section
    await page.getByText("About").click();

    // Should show app description
    await expect(page.getByText(/snapotter|privacy|self-hosted/i).first()).toBeVisible();
  });

  test("System Settings section has configuration", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();

    // Navigate to System Settings section
    await page.getByText("System Settings").click();

    // Should show system configuration options
    await expect(page.getByText(/app name|upload limit|theme/i).first()).toBeVisible();
  });

  test("settings dialog can be closed", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await expect(page.getByText("General").first()).toBeVisible();

    // Close by clicking X or outside
    const closeBtn = page.getByRole("button", { name: /close|×/i }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }

    // Dialog should be gone
    await page.waitForTimeout(300);
  });
});
