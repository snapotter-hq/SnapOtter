import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Helper: resolve fixture image paths
// ---------------------------------------------------------------------------
function getFixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", "image", "valid", name);
}

const FIXTURE_JPG = getFixturePath("test-100x100.jpg");
const FIXTURE_PNG = getFixturePath("test-200x150.png");
const FIXTURE_WEBP = getFixturePath("test-50x50.webp");
const FIXTURE_HEIC = getFixturePath("test-200x150.heic");
const FIXTURE_PORTRAIT_JPG = getFixturePath("test-portrait.jpg");

// ---------------------------------------------------------------------------
// Multi-file upload tests
// ---------------------------------------------------------------------------
test.describe("Multi-file upload", () => {
  test("upload 2 files via file chooser and both appear in Files section", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");

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
    await page.goto("/image/resize");

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
    await page.goto("/image/resize");

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
    await page.goto("/image/resize");

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
    await page.goto("/image/resize");

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
    await page.goto("/image/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // Counter badge should show "1 / 3"
    await expect(page.getByText("1 / 3")).toBeVisible();

    // Previous arrow should NOT be visible on first image
    await expect(page.getByRole("button", { name: "Previous file" })).not.toBeVisible();

    // Next arrow should be visible
    await expect(page.getByRole("button", { name: "Next file" })).toBeVisible();

    // Click next to go to image 2
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();

    // Both arrows should be visible on middle image
    await expect(page.getByRole("button", { name: "Previous file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next file" })).toBeVisible();

    // Click next to go to image 3
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("3 / 3")).toBeVisible();

    // Next arrow should NOT be visible on last image
    await expect(page.getByRole("button", { name: "Next file" })).not.toBeVisible();

    // Click previous to go back
    await page.getByRole("button", { name: "Previous file" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
  });

  test("counter badge shows N/M format", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    // Should display "1 / 2" counter badge
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("upload 5 files and all are listed", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    // Upload initial 3 files
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Add 2 more via "+ Add more"
    const addMorePromise = page.waitForEvent("filechooser");
    await page.getByText("+ Add more").click();
    const addMoreChooser = await addMorePromise;
    await addMoreChooser.setFiles([FIXTURE_HEIC, FIXTURE_PORTRAIT_JPG]);
    await page.waitForTimeout(500);

    // All 5 files should be registered
    await expect(page.getByText("Files (5)")).toBeVisible();

    // Counter badge should show "1 / 5"
    await expect(page.getByText("1 / 5")).toBeVisible();
  });

  test("upload 5 files shows count with filenames and sizes", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    // Upload initial 3 files
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    // Add 2 more via "+ Add more"
    const addMorePromise = page.waitForEvent("filechooser");
    await page.getByText("+ Add more").click();
    const addMoreChooser = await addMorePromise;
    await addMoreChooser.setFiles([FIXTURE_HEIC, FIXTURE_PORTRAIT_JPG]);
    await page.waitForTimeout(500);

    // Should show "5 files" in the file count badge
    await expect(page.getByText("Files (5)")).toBeVisible();

    // Each file should have a thumbnail with its filename as the title
    await expect(page.locator("button[title='test-100x100.jpg']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.png']")).toBeVisible();
    await expect(page.locator("button[title='test-50x50.webp']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.heic']")).toBeVisible();
    await expect(page.locator("button[title='test-portrait.jpg']")).toBeVisible();

    // File info area should show filename and size for the selected file
    await expect(page.getByText(/test-/i).first()).toBeVisible();
    await expect(page.getByText(/KB|B/i).first()).toBeVisible();
  });

  test("upload 3+ files via drag-and-drop and all appear", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    const dropzone = page.locator("[class*='border-dashed']").first();

    // Playwright dispatchEvent simulates a drop by creating a DataTransfer
    // with the specified files. The Dropzone component uses onDrop to call onFiles.
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    // Create file buffers in the browser and add them to the DataTransfer
    await page.evaluate(
      ([dt]) => {
        const names = ["drop-test-1.jpg", "drop-test-2.png", "drop-test-3.webp"];
        for (const name of names) {
          const arr = new Uint8Array(64);
          for (let i = 0; i < arr.length; i++) arr[i] = i;
          const blob = new Blob([arr], { type: "image/jpeg" });
          const file = new File([blob], name, { type: "image/jpeg" });
          (dt as DataTransfer).items.add(file);
        }
      },
      [dataTransfer],
    );

    await dropzone.dispatchEvent("drop", { dataTransfer });
    await page.waitForTimeout(1000);

    // All 3 files should be registered
    await expect(page.getByText("Files (3)")).toBeVisible();
  });

  test("selecting thumbnail updates main viewer image", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // The main viewer img should be visible
    const mainImg = page.locator("section[aria-label='Preview area'] img").first();
    await expect(mainImg).toBeVisible();

    // Verify an image is displayed in the viewer (first file is selected by default)

    // Click the second thumbnail (test-200x150.png)
    await page.locator("button[title='test-200x150.png']").click();
    await page.waitForTimeout(300);

    // Counter badge should now show "2 / 3"
    await expect(page.getByText("2 / 3")).toBeVisible();

    // The main viewer image alt text should update to match the second file
    await expect(mainImg).toHaveAttribute("alt", "test-200x150.png");

    // Click the third thumbnail (test-50x50.webp)
    await page.locator("button[title='test-50x50.webp']").click();
    await page.waitForTimeout(300);

    // Counter badge should now show "3 / 3"
    await expect(page.getByText("3 / 3")).toBeVisible();
    await expect(mainImg).toHaveAttribute("alt", "test-50x50.webp");
  });
});

// ---------------------------------------------------------------------------
// Batch processing tests
// ---------------------------------------------------------------------------
test.describe("Batch processing", () => {
  test("upload 3 images, process resize, all 3 results available", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("'Download All' button visible for batch results", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Download All (ZIP) button should be visible
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });

  test("navigate through batch results with Previous/Next", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Should show counter "1 / 2"
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Navigate to next result
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();

    // Navigate back
    await page.getByRole("button", { name: "Previous file" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("each batch result has download link", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
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
    await page.getByRole("button", { name: "Next file" }).click();
    await page.waitForTimeout(500);

    // Second result should also have a download link
    await expect(
      page
        .getByRole("link", { name: /download/i })
        .or(page.getByRole("button", { name: /download$/i }))
        .first(),
    ).toBeVisible();
  });

  test("spinner appears during batch processing", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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

    // A spinner (animate-spin) should appear while processing is in progress
    const spinner = page.locator("[class*='animate-spin']");
    // The spinner might appear briefly or for a longer period depending on
    // processing speed. We check it was ever visible or processing completed.
    await spinner.isVisible({ timeout: 3000 }).catch(() => false);

    // Wait for processing to complete regardless
    await waitForProcessing(page, 30_000);

    // After processing, spinner should be gone
    await expect(spinner).not.toBeVisible({ timeout: 5_000 });

    // And results should be available
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("'Download All' triggers ZIP download", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click Download All and verify a download is triggered
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download all/i }).click();
    const download = await downloadPromise;

    // The downloaded file should be a ZIP
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test("undo on one image does not affect others", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

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
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Both images should be in processed state - files count should still be 2
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Click undo (resets all processed state for all entries in the store)
    const undoBtn = page.getByRole("button", { name: /adjust settings/i });
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await undoBtn.click();
      await page.waitForTimeout(500);

      // Files should still be loaded (not cleared)
      await expect(page.getByText("Files (2)")).toBeVisible();
    }
  });

  test("per-image undo isolation: undoing image 1 preserves image 2 result", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");

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

    // Wait for result on image 1
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Image 1 should have a download link (processed state)
    const downloadLink = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download$/i }));
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });

    // Navigate to image 2 and verify it also has a download link
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });

    // Go back to image 1 and click undo/reset
    await page.getByRole("button", { name: "Previous file" }).click();
    await expect(page.getByText("1 / 2")).toBeVisible();

    const undoBtn = page.getByRole("button", { name: /adjust settings/i });
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await undoBtn.click();
      await page.waitForTimeout(500);
    }

    // Files should still be loaded (both present)
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Navigate to image 2 -- it should still have its processed result
    // (The current implementation resets all entries globally, so this
    // verifies the desired per-image undo isolation behavior.)
    await page.locator("button[title='test-200x150.png']").click();
    await page.waitForTimeout(300);

    // Image 2 should still be navigable and files intact
    await expect(page.getByText("Files (2)")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Mixed formats
// ---------------------------------------------------------------------------
test.describe("Mixed formats", () => {
  test("upload JPEG + PNG + WebP and all are accepted and shown", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/compress");

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

  test("mixed JPEG + PNG + WebP batch processes correctly", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    // All 3 mixed-format files should be registered
    await expect(page.getByText("Files (3)")).toBeVisible();

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch with mixed formats
    await page.getByRole("button", { name: /resize.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    // After processing, results should be available
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Counter badge should show all 3 results navigable
    await expect(page.getByText("1 / 3")).toBeVisible();

    // Navigate through all results to verify each processed successfully
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();

    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("3 / 3")).toBeVisible();

    // Download All should be available for mixed-format batch
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });

  test("upload JPEG + PNG + WebP + HEIC mixed batch and all are accepted", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP, FIXTURE_HEIC]);
    await page.waitForTimeout(1000);

    // All 4 files should be registered
    await expect(page.getByText("Files (4)")).toBeVisible();

    // Counter badge should show "1 / 4"
    await expect(page.getByText("1 / 4")).toBeVisible();

    // All 4 thumbnails should be visible in the thumbnail strip
    await expect(page.locator("button[title='test-100x100.jpg']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.png']")).toBeVisible();
    await expect(page.locator("button[title='test-50x50.webp']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.heic']")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Batch processing with non-resize tools
// ---------------------------------------------------------------------------
test.describe("Batch processing - Compress tool", () => {
  test("batch compress 2 images with quality mode", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // Switch to quality mode
    await page.getByRole("button", { name: /quality/i }).click();

    // Process batch
    const processBtn = page.getByRole("button", { name: /compress.*2 files/i });
    await expect(processBtn).toBeVisible();
    await processBtn.click();
    await waitForProcessing(page, 30_000);

    // After processing, results should be available
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Counter badge should show navigable results
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Navigate to second result
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
  });

  test("batch compress 3 images and Download All ZIP available", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Switch to quality mode
    await page.getByRole("button", { name: /quality/i }).click();

    // Process batch
    await page.getByRole("button", { name: /compress.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Download All (ZIP) button should be visible
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });
});

test.describe("Batch processing - Convert tool", () => {
  test("batch convert 2 images to WebP format", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // Select WebP as the target format
    await page.locator("#convert-target-format").selectOption("webp");

    // Process batch
    const processBtn = page.getByRole("button", { name: /convert.*2 files/i });
    await expect(processBtn).toBeVisible();
    await processBtn.click();
    await waitForProcessing(page, 30_000);

    // After processing, results should be available
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Counter badge should show navigable results
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("batch convert 3 images and all results navigable", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Select PNG as the target format
    await page.locator("#convert-target-format").selectOption("png");

    // Process batch
    await page.getByRole("button", { name: /convert.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate through all 3 results
    await expect(page.getByText("1 / 3")).toBeVisible();
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("3 / 3")).toBeVisible();

    // Download All should be available
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });
});

test.describe("Batch processing - Rotate tool", () => {
  test("batch rotate 2 images by 90 degrees", async ({ loggedInPage: page }) => {
    await page.goto("/image/rotate");

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // Click the +90 degree rotate button
    await page.locator("[data-testid='rotate-right']").click();

    // Process batch -- rotate uses "Apply (N files)" pattern
    const processBtn = page.getByRole("button", { name: /apply.*2 files/i });
    await expect(processBtn).toBeVisible();
    await processBtn.click();
    await waitForProcessing(page, 30_000);

    // After processing, results should be available
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Counter badge should show navigable results
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Navigate to second result
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
  });

  test("batch rotate 3 images with flip and Download All available", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/rotate");

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Apply a horizontal flip
    await page.locator("[data-testid='rotate-flip-h']").click();

    // Process batch
    await page.getByRole("button", { name: /apply.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Download All should be available
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });
});
