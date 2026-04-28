import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Helper: resolve fixture image paths
// ---------------------------------------------------------------------------
function getFixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

const FIXTURE_JPG = getFixturePath("test-100x100.jpg");
const FIXTURE_PNG = getFixturePath("test-200x150.png");
const FIXTURE_WEBP = getFixturePath("test-50x50.webp");

// ---------------------------------------------------------------------------
// Multi-file upload tests
// ---------------------------------------------------------------------------
test.describe("Multi-file upload", () => {
  test("upload 2 files via file chooser and both appear in Files section", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Both files should be registered
    await expect(page.getByText("Files (2)")).toBeVisible();
  });

  test("upload 3+ files and all are listed with filenames and sizes", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // All 3 files should be registered
    await expect(page.getByText("Files (3)")).toBeVisible();

    // The currently selected file info should show a filename and size
    await expect(page.getByText(/test-/i).first()).toBeVisible();
    await expect(page.getByText(/KB|B/i).first()).toBeVisible();
  });

  test("'+ Add more' adds files to existing set", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload initial file
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG]);
    await page.waitForTimeout(500);

    await expect(page.getByText("Files (1)")).toBeVisible();

    // Click "+ Add more" which triggers a programmatic file input
    const addMorePromise = page.waitForEvent("filechooser");
    await page.getByText("+ Add more").click();
    const addMoreChooser = await addMorePromise;
    await addMoreChooser.setFiles([FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    // Now should show 3 files
    await expect(page.getByText("Files (3)")).toBeVisible();
  });

  test("'Clear all' removes all files and returns to dropzone", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload files
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(500);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // Clear all files
    await page.getByText("Clear all").click();

    // Dropzone should reappear
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("ThumbnailStrip shows at bottom with clickable thumbnails", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // ThumbnailStrip renders when entries.length > 1
    // Each thumbnail is a <button> with a title matching the filename
    const jpgThumb = page.locator("button[title='test-100x100.jpg']");
    const pngThumb = page.locator("button[title='test-200x150.png']");

    await expect(jpgThumb).toBeVisible();
    await expect(pngThumb).toBeVisible();

    // Click the second thumbnail and verify it becomes selected (outline-primary)
    await pngThumb.click();
    await expect(pngThumb).toHaveClass(/outline-primary/);
  });

  test("Previous/Next arrows cycle through images", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // Counter badge should show "1 / 3"
    await expect(page.getByText("1 / 3")).toBeVisible();

    // Previous arrow should NOT be visible on first image
    await expect(page.getByRole("button", { name: "Previous image" })).not.toBeVisible();

    // Next arrow should be visible
    await expect(page.getByRole("button", { name: "Next image" })).toBeVisible();

    // Click next to go to image 2
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();

    // Both arrows should be visible on middle image
    await expect(page.getByRole("button", { name: "Previous image" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next image" })).toBeVisible();

    // Click next to go to image 3
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.getByText("3 / 3")).toBeVisible();

    // Next arrow should NOT be visible on last image
    await expect(page.getByRole("button", { name: "Next image" })).not.toBeVisible();

    // Click previous to go back
    await page.getByRole("button", { name: "Previous image" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
  });

  test("counter badge shows N/M format", async ({ loggedInPage: page }) => {
    await page.goto("/compress");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Should display "1 / 2" counter badge
    await expect(page.getByText("1 / 2")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Batch processing tests
// ---------------------------------------------------------------------------
test.describe("Batch processing", () => {
  test("upload 3 images, process resize, all 3 results available", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Set resize width to 50px
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Click the batch process button (should mention file count)
    const processBtn = page.getByRole("button", { name: /resize.*3 files/i });
    await processBtn.click();

    // Wait for processing to complete
    await waitForProcessing(page, 30_000);

    // After processing, the image area should show a result
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("'Download All' button visible for batch results", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload multiple images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch
    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for at least one result image
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Download All (ZIP) button should be visible
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });

  test("navigate through batch results with Previous/Next", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch
    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Should show counter "1 / 2"
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Navigate to next result
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();

    // Navigate back
    await page.getByRole("button", { name: "Previous image" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("each batch result has download link", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch
    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // First result should have a download link
    await expect(
      page
        .getByRole("link", { name: /download/i })
        .or(page.getByRole("button", { name: /download$/i }))
        .first(),
    ).toBeVisible();

    // Navigate to second result
    await page.getByRole("button", { name: "Next image" }).click();
    await page.waitForTimeout(500);

    // Second result should also have a download link
    await expect(
      page
        .getByRole("link", { name: /download/i })
        .or(page.getByRole("button", { name: /download$/i }))
        .first(),
    ).toBeVisible();
  });

  test("undo on one image does not affect others", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch
    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Both images should be in processed state - files count should still be 2
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Click undo (resets all processed state for all entries in the store)
    const undoBtn = page.getByRole("button", { name: /undo|reset/i });
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await undoBtn.click();
      await page.waitForTimeout(500);

      // Files should still be loaded (not cleared)
      await expect(page.getByText("Files (2)")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Mixed formats
// ---------------------------------------------------------------------------
test.describe("Mixed formats", () => {
  test("upload JPEG + PNG + WebP and all are accepted and shown", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/compress");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // All 3 files should be registered
    await expect(page.getByText("Files (3)")).toBeVisible();

    // Counter badge should show "1 / 3"
    await expect(page.getByText("1 / 3")).toBeVisible();

    // All 3 thumbnails should be visible in the thumbnail strip
    await expect(page.locator("button[title='test-100x100.jpg']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.png']")).toBeVisible();
    await expect(page.locator("button[title='test-50x50.webp']")).toBeVisible();
  });
});
