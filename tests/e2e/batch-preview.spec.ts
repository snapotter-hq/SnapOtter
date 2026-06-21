import path from "node:path";
import { expect, getTestHeicPath, test } from "./helpers";

// ---------------------------------------------------------------------------
// Tests for batch processing preview and download fixes.
// Verifies that batch results show proper image previews (not UUID text)
// and that downloads produce correctly named files.
// ---------------------------------------------------------------------------

function getFixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

function _uploadMultipleFiles(page: import("@playwright/test").Page, filePaths: string[]) {
  return async () => {
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePaths);
    await page.waitForTimeout(1000);
  };
}

test.describe("Batch processing preview and download", () => {
  test("batch adjust-colors shows image preview, not UUID text", async ({ loggedInPage: page }) => {
    await page.goto("/image/adjust-colors");

    // Upload 2 images (PNG + JPG)
    const files = [getFixturePath("test-200x150.png"), getFixturePath("test-100x100.jpg")];
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(files);
    await page.waitForTimeout(1000);

    // Verify 2 files are loaded
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Select Grayscale effect (effects are always visible, no tab click needed)
    await page.getByRole("button", { name: "Grayscale" }).click();

    // Click Apply (batch mode for multiple files)
    await page.getByRole("button", { name: /apply.*2 files/i }).click();

    // Wait for processing to complete
    await expect(page.getByText(/conversion complete/i)).not.toBeVisible({ timeout: 30_000 });

    // The image preview area should show an actual image
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Should NOT show UUID-like text as filename
    await expect(page.getByText(/files cannot be previewed/i)).not.toBeVisible();

    // The Review panel should show a real filename (with extension)
    const reviewFilename = page
      .locator("text=test-200x150.png")
      .or(page.locator("text=test-200x150"));
    await expect(reviewFilename.first()).toBeVisible({ timeout: 5_000 });

    // The Download All (ZIP) button should be visible
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });

  test("batch adjust-colors with HEIC shows preview", async ({ loggedInPage: page }) => {
    await page.goto("/image/adjust-colors");

    // Upload HEIC + PNG
    const heicPath = getTestHeicPath();
    const pngPath = getFixturePath("test-200x150.png");
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([heicPath, pngPath]);
    await page.waitForTimeout(2000);

    // Select Grayscale
    await page.getByRole("button", { name: "Grayscale" }).click();

    // Apply batch
    await page.getByRole("button", { name: /apply.*2 files/i }).click();

    // Wait for processing - should show image preview
    await page.waitForTimeout(3000);
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 20_000,
    });

    // Navigate to second image and verify it also has a preview
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("old route /brightness-contrast redirects to /adjust-colors", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");
    await page.waitForURL("/image/adjust-colors");
    await expect(page.getByText("Adjust Colors")).toBeVisible();
  });
});

test.describe("Favicon download button", () => {
  test("favicon shows download button instead of auto-downloading", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/favicon");

    // Upload a test image
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getFixturePath("test-200x150.png"));
    await page.waitForTimeout(500);

    // Click generate
    await page.getByTestId("favicon-submit").click();

    // Wait for the download button to appear (not an auto-download)
    const downloadLink = page.getByTestId("favicon-download");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    // Verify it's an <a> tag with download attribute (not a button that auto-triggers)
    await expect(downloadLink).toHaveAttribute("download", "favicons.zip");
    await expect(downloadLink).toHaveAttribute("href", /^blob:/);
  });
});
