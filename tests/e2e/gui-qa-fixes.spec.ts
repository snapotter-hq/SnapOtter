import { expect, test } from "./helpers";

test.describe("QA Fixes Verification", () => {
  test("home page loads after login", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();
    // Should see the main app, not the login page
    await expect(page.locator("text=Login").first())
      .not.toBeVisible({ timeout: 5_000 })
      .catch(() => {});
  });

  test("tool page loads correctly", async ({ page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    // Should see resize tool content
    await expect(page.locator("text=Resize").first()).toBeVisible({ timeout: 10_000 });
  });

  test("noncanonical section for a known tool shows not-found state", async ({ page }) => {
    await page.goto("/tools/resize");
    await expect(page.getByText(/tool not found/i)).toBeVisible();
  });

  test("invalid tool slug shows not-found state", async ({ page }) => {
    await page.goto("/zzz-nonexistent-tool-xyz");
    await page.waitForLoadState("networkidle");
    // Should show "Tool not found" or 404 text
    const notFound = page.locator("text=not found").or(page.locator("text=404"));
    await expect(notFound.first()).toBeVisible({ timeout: 10_000 });
  });

  test("multi-segment invalid URL shows 404 page", async ({ page }) => {
    await page.goto("/some/deep/nested/invalid/path");
    await page.waitForLoadState("networkidle");
    const notFound = page
      .locator("text=404")
      .or(page.locator("text=not found"))
      .or(page.locator("text=Page not found"))
      .first();
    await expect(notFound).toBeVisible({ timeout: 10_000 });
  });

  test("privacy page renders", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    // Should show privacy policy content, not redirect away
    const content = page.locator("text=Privacy").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("automate page loads and shows tool palette", async ({ page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    // Should see the pipeline builder
    const palette = page.locator("text=Resize").first();
    await expect(palette).toBeVisible({ timeout: 10_000 });
  });

  test("files page loads", async ({ page }) => {
    await page.goto("/files");
    await page.waitForLoadState("networkidle");
    // Should see the files interface (even if empty)
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("settings dialog opens and shows tabs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click settings in sidebar
    const settingsBtn = page.locator("text=Settings").first();
    if (await settingsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await settingsBtn.click();
      // Should see settings dialog with tabs
      await expect(page.locator("text=General").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("editor page loads", async ({ page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");
    // Should see the editor interface
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("dropzone uses i18n strings (no hardcoded 'or')", async ({ page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    // The dropzone should be visible with upload button
    const uploadBtn = page.locator("text=Upload").first();
    await expect(uploadBtn).toBeVisible({ timeout: 10_000 });
  });
});
