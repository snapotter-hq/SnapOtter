import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- API Keys tab (full coverage)
// ---------------------------------------------------------------------------

test.describe("GUI Settings - API Keys Tab", () => {
  test("navigates to API Keys tab and shows heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.locator("h3").filter({ hasText: "API Keys" })).toBeVisible();
    await expect(page.getByText("Manage API keys for programmatic access")).toBeVisible();
  });

  test("shows Generate API Key button and name input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.getByPlaceholder("Key name (optional)")).toBeVisible();
    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();
  });

  test("generating an API key displays the key with copy button", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `apiKeyTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // The key should appear in a code element
    const keyDisplay = page.locator("code.font-mono");
    await expect(keyDisplay).toBeVisible({ timeout: 5_000 });

    // Copy button should be visible next to the key
    await expect(page.locator("button[title='Copy']")).toBeVisible();

    // The "Store this key" warning should be visible
    await expect(page.getByText("Store this key securely")).toBeVisible();

    // Clean up: delete the key we just created
    const deleteBtn = page.locator("button[title='Delete key']").first();
    if (await deleteBtn.isVisible()) {
      page.on("dialog", (d) => d.accept());
      await deleteBtn.click();
    }
  });

  test("generated key appears in Existing Keys list", async ({ loggedInPage: page }) => {
    await openSettings(page);
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
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const scopingToggle = page.getByText("Restrict permissions (optional)");
    await expect(scopingToggle).toBeVisible();

    await scopingToggle.click();

    // After expanding, the collapse text and permission checkboxes appear
    await expect(page.getByText("Remove permission scoping")).toBeVisible();
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    await expect(page.getByText("tools:use")).toBeVisible();
  });

  test("permission scoping checkboxes can be toggled", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Open scoping panel
    await page.getByText("Restrict permissions (optional)").click();
    await expect(page.getByText("Remove permission scoping")).toBeVisible();

    // Find the first checkbox and verify it can be checked
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    await expect(firstCheckbox).not.toBeChecked();
    await firstCheckbox.check();
    await expect(firstCheckbox).toBeChecked();

    // Uncheck it
    await firstCheckbox.uncheck();
    await expect(firstCheckbox).not.toBeChecked();
  });

  test("deleting an API key removes it from the list", async ({ loggedInPage: page }) => {
    await openSettings(page);
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
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.getByText("Expires:")).toBeVisible();
    await expect(page.locator("input[type='datetime-local']")).toBeVisible();
  });

  test("expiration date Clear button works", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const dateInput = page.locator("input[type='datetime-local']");
    await dateInput.fill("2030-12-31T23:59");

    // Clear button should appear after setting a date
    const clearBtn = page.getByRole("button", { name: /clear/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Input should be empty again
    await expect(dateInput).toHaveValue("");
  });

  test("empty state shows no keys message or existing keys list", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Wait for the API Keys heading to confirm the section loaded
    await expect(page.locator("h3").filter({ hasText: "API Keys" })).toBeVisible();
    // Wait for Generate button to appear (confirms loading is complete)
    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();

    // If no keys exist, the empty message should be shown; otherwise existing keys list
    const noKeysText = page.getByText("No API keys yet. Generate one to get started.");
    const existingKeysHeader = page.getByText("Existing Keys");

    // Wait briefly for state to settle after loading
    await page.waitForTimeout(500);
    const noKeysVisible = await noKeysText.isVisible().catch(() => false);
    const existingVisible = await existingKeysHeader.isVisible().catch(() => false);

    // One of the two states must be true
    expect(noKeysVisible || existingVisible).toBe(true);
  });

  test("generating a key with scoped permissions creates a scoped key", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Set a key name
    const keyName = `scopedKey-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);

    // Open scoping and select a permission
    await page.getByText("Restrict permissions (optional)").click();
    await expect(page.getByText("Remove permission scoping")).toBeVisible();

    // Check the first permission checkbox
    await page.locator("input[type='checkbox']").first().check();

    // Generate the key
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // The scoped key should show its permissions in the Existing Keys list
    await expect(page.getByText("Scoped:")).toBeVisible();

    // Clean up
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);
  });
});
