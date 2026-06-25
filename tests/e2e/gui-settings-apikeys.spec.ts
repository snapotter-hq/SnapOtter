import type { Page } from "@playwright/test";
import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog: API Keys tab (full coverage)
// ---------------------------------------------------------------------------

// The delete control carries both title="Delete key" and aria-label="Delete
// key" (t.a11y.deleteKey), so getByRole resolves it by accessible name.
const deleteKeyButton = (page: Page) => page.getByRole("button", { name: "Delete key" }).first();

// Best-effort cleanup. The API keys list (GET /v1/api-keys) is shared by every
// admin session and is rate-limited to 30/min per IP. Across parallel spec
// files a transient 429 makes loadKeys() return empty, so the Delete control
// can momentarily be absent. Cleanup must never fail an otherwise-passing test,
// so this only clicks when the button is actually present.
async function cleanupApiKey(page: Page): Promise<void> {
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.accept());
  const btn = deleteKeyButton(page);
  if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

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
    await cleanupApiKey(page);
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
    await cleanupApiKey(page);
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

    // Delete it (the row's delete control must be present after the key lists)
    page.removeAllListeners("dialog");
    page.on("dialog", (d) => d.accept());
    const deleteBtn = deleteKeyButton(page);
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

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
    await cleanupApiKey(page);
  });

  test("generated key starts with si_ prefix", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `prefixTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // The key should appear in a code element
    const keyDisplay = page.locator("code.font-mono");
    await expect(keyDisplay).toBeVisible({ timeout: 5_000 });

    // Verify the key text starts with "si_"
    const keyText = await keyDisplay.textContent();
    expect(keyText).toMatch(/^si_/);

    // Clean up
    await cleanupApiKey(page);
  });

  test("existing keys show prefix and creation date", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `metaTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // In the Existing Keys list, the entry shows the key name plus a metadata
    // line with the prefix and creation date. The list prefix is a SHA-256
    // lookup hash (not the raw "si_" key), so assert on the name and the
    // "Created" date rather than the key value.
    await expect(page.getByText("Existing Keys")).toBeVisible();
    await expect(page.getByText(keyName)).toBeVisible();
    await expect(page.getByText(/Created/).first()).toBeVisible();

    // Clean up
    await cleanupApiKey(page);
  });

  test("generating a key without a name still works", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Leave the name field empty and generate
    await page.getByPlaceholder("Key name (optional)").fill("");
    await page.getByRole("button", { name: /generate api key/i }).click();

    // The key should still appear
    const keyDisplay = page.locator("code.font-mono");
    await expect(keyDisplay).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Store this key securely")).toBeVisible();

    // Clean up
    await cleanupApiKey(page);
  });

  test("cancel on delete confirmation keeps the key", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `cancelDelete-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // Dismiss the confirm dialog to cancel deletion
    page.removeAllListeners("dialog");
    page.on("dialog", (d) => d.dismiss());
    const deleteBtn = deleteKeyButton(page);
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Key should still be present
    await expect(page.getByText(keyName)).toBeVisible();

    // Now actually delete for cleanup
    await cleanupApiKey(page);
  });
});
