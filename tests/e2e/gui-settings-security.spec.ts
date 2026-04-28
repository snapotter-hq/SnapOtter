import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- Security (change password) and API Keys tabs
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Security Tab", () => {
  test("shows Change Password form with required inputs", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /security/i }).click();

    await expect(page.locator("h3").filter({ hasText: "Security" })).toBeVisible();
    await expect(page.getByText("Change Password").first()).toBeVisible();

    // Three password fields
    await expect(page.getByPlaceholder("Current Password")).toBeVisible();
    await expect(page.getByPlaceholder("New Password").first()).toBeVisible();
    await expect(page.getByPlaceholder("Confirm New Password")).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: /change password/i })).toBeVisible();
  });

  test("mismatched passwords show error message", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /security/i }).click();

    await page.getByPlaceholder("Current Password").fill("admin");
    await page.getByPlaceholder("New Password").first().fill("NewPass123");
    await page.getByPlaceholder("Confirm New Password").fill("DifferentPass456");

    await page.getByRole("button", { name: /change password/i }).click();

    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("password visibility toggles work", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /security/i }).click();

    const currentPwInput = page.getByPlaceholder("Current Password");
    await expect(currentPwInput).toHaveAttribute("type", "password");

    // Click the eye toggle button next to the current password field
    const toggleButtons = page.locator("form button[type='button']");
    await toggleButtons.first().click();

    await expect(currentPwInput).toHaveAttribute("type", "text");
  });
});

test.describe("GUI Settings - API Keys Tab", () => {
  test("shows Generate API Key button and name input", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.locator("h3").filter({ hasText: "API Keys" })).toBeVisible();
    await expect(page.getByPlaceholder("Key name (optional)")).toBeVisible();
    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();
  });

  test("generating an API key displays the key once", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    // Give a unique name so we can identify and clean it up
    const keyName = `guiTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // The key should appear in a code element
    const keyDisplay = page.locator("code.font-mono");
    await expect(keyDisplay).toBeVisible({ timeout: 5_000 });

    // The "Store this key" warning should be visible
    await expect(page.getByText("Store this key securely")).toBeVisible();

    // Clean up: delete the key we just created
    const deleteBtn = page.locator("button[title='Delete key']").first();
    if (await deleteBtn.isVisible()) {
      page.on("dialog", (d) => d.accept());
      await deleteBtn.click();
    }
  });

  test("generated key appears in existing keys list", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `listTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // Wait for key to appear
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // The key name should appear in the "Existing Keys" section
    await expect(page.getByText("Existing Keys")).toBeVisible();
    await expect(page.getByText(keyName)).toBeVisible();

    // Clean up
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);
  });

  test("permission scoping toggle reveals checkboxes", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    const scopingToggle = page.getByText("Restrict permissions (optional)");
    await expect(scopingToggle).toBeVisible();

    await scopingToggle.click();

    // After expanding, the collapse text and permission checkboxes appear
    await expect(page.getByText("Remove permission scoping")).toBeVisible();
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    await expect(page.getByText("tools:use")).toBeVisible();
  });

  test("deleting an API key removes it from the list", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    // Create a key to delete
    const keyName = `deleteTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // Confirm the key appears
    await expect(page.getByText(keyName)).toBeVisible();

    // Delete it
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();

    // Key name should disappear
    await expect(page.getByText(keyName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("expiration date input is available", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Settings").click();
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.getByText("Expires:")).toBeVisible();
    await expect(page.locator("input[type='datetime-local']")).toBeVisible();
  });
});
