import path from "node:path";
import { expect, getTestImagePath, test, uploadTestImage, waitForProcessing } from "./helpers";

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
// Helper: navigate to /automate with retry logic
// ---------------------------------------------------------------------------
async function gotoAutomate(page: import("@playwright/test").Page) {
  const heading = page.getByRole("heading", {
    name: /pipeline builder|automate/i,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/automate", { waitUntil: "load" });

    try {
      await expect(heading).toBeVisible({ timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }

  // Final attempt - let it throw if it fails
  await page.goto("/automate", { waitUntil: "load" });
  await expect(heading).toBeVisible({ timeout: 10_000 });
}

/** Wait for pipeline steps to render by counting Remove buttons. */
async function waitForSteps(page: import("@playwright/test").Page, count: number) {
  await expect(page.getByTitle("Remove")).toHaveCount(count, {
    timeout: 5_000,
  });
}

/** Search for a tool by name in the palette and click it. */
async function addToolStep(
  page: import("@playwright/test").Page,
  name: string,
  expectedCount: number,
) {
  await page.getByPlaceholder("Search tools...").fill(name);
  await page
    .getByRole("button", { name: new RegExp(name, "i") })
    .first()
    .click();
  await waitForSteps(page, expectedCount);
}

/** Upload files via the dropzone file chooser on a tool page. */
async function uploadFiles(page: import("@playwright/test").Page, files: string[]) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(files);
  await page.waitForTimeout(1000);
}

// ===========================================================================
// MULTI-FILE UPLOAD: drag-and-drop variants
// ===========================================================================
test.describe("Multi-file upload - drag-and-drop", () => {
  test("drag-and-drop 2 files onto dropzone registers both", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    const dropzone = page.locator("[class*='border-dashed']").first();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    await page.evaluate(
      ([dt]) => {
        const names = ["drop-a.jpg", "drop-b.png"];
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

    await expect(page.getByText("Files (2)")).toBeVisible();
    await expect(page.getByText("1 / 2")).toBeVisible();
  });

  test("drag-and-drop 5 files and all appear with thumbnails", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");

    const dropzone = page.locator("[class*='border-dashed']").first();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    await page.evaluate(
      ([dt]) => {
        const names = ["dd-1.jpg", "dd-2.png", "dd-3.webp", "dd-4.jpg", "dd-5.png"];
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

    await expect(page.getByText("Files (5)")).toBeVisible();
    await expect(page.getByText("1 / 5")).toBeVisible();

    // All 5 thumbnails should be in the strip
    for (const name of ["dd-1.jpg", "dd-2.png", "dd-3.webp", "dd-4.jpg", "dd-5.png"]) {
      await expect(page.locator(`button[title='${name}']`)).toBeVisible();
    }
  });
});

// ===========================================================================
// MULTI-FILE UPLOAD: individual file info and display
// ===========================================================================
test.describe("Multi-file upload - file info display", () => {
  test("selecting each thumbnail shows correct filename in info area", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Click first thumbnail
    await page.locator("button[title='test-100x100.jpg']").click();
    await page.waitForTimeout(300);
    const mainImg = page.locator("section[aria-label='Preview area'] img").first();
    await expect(mainImg).toHaveAttribute("alt", "test-100x100.jpg");

    // Click second thumbnail
    await page.locator("button[title='test-200x150.png']").click();
    await page.waitForTimeout(300);
    await expect(mainImg).toHaveAttribute("alt", "test-200x150.png");

    // Click third thumbnail
    await page.locator("button[title='test-50x50.webp']").click();
    await page.waitForTimeout(300);
    await expect(mainImg).toHaveAttribute("alt", "test-50x50.webp");
  });

  test("file size is displayed for each file when selected", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // First file should show size info
    await expect(page.getByText(/KB|B/i).first()).toBeVisible();

    // Navigate to second file
    await page.getByRole("button", { name: "Next file" }).click();
    await page.waitForTimeout(300);

    // Second file should also show size info
    await expect(page.getByText(/KB|B/i).first()).toBeVisible();
  });

  test("counter badge updates when files are added via Add more", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");

    // Upload 1 file initially
    await uploadFiles(page, [FIXTURE_JPG]);
    await expect(page.getByText("Files (1)")).toBeVisible();

    // Add 1 more
    const addMorePromise1 = page.waitForEvent("filechooser");
    await page.getByText("+ Add more").click();
    const addMoreChooser1 = await addMorePromise1;
    await addMoreChooser1.setFiles([FIXTURE_PNG]);
    await page.waitForTimeout(500);

    await expect(page.getByText("Files (2)")).toBeVisible();
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Add 1 more
    const addMorePromise2 = page.waitForEvent("filechooser");
    await page.getByText("+ Add more").click();
    const addMoreChooser2 = await addMorePromise2;
    await addMoreChooser2.setFiles([FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    await expect(page.getByText("Files (3)")).toBeVisible();
  });

  test("ThumbnailStrip not shown for single file", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG]);

    await expect(page.getByText("Files (1)")).toBeVisible();

    // ThumbnailStrip only renders when entries.length > 1
    // No thumbnail buttons should appear for a single file
    const thumbButtons = page.locator("button[title='test-100x100.jpg']");
    await expect(thumbButtons).not.toBeVisible();
  });

  test("Clear all then re-upload works correctly", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    // Upload initial files
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG]);
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Clear all
    await page.getByText("Clear all").click();
    await expect(page.getByText("Upload from computer")).toBeVisible();

    // Re-upload different files
    await uploadFiles(page, [FIXTURE_WEBP, FIXTURE_PORTRAIT_JPG]);
    await expect(page.getByText("Files (2)")).toBeVisible();

    // Thumbnails should show the new files, not the old ones
    await expect(page.locator("button[title='test-50x50.webp']")).toBeVisible();
    await expect(page.locator("button[title='test-portrait.jpg']")).toBeVisible();
  });
});

// ===========================================================================
// BATCH PROCESSING: results verification
// ===========================================================================
test.describe("Batch processing - results verification", () => {
  test("batch resize 3 images and each result has distinct download link", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Set resize width
    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch
    await page.getByRole("button", { name: /resize.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    // Wait for result
    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    const downloadLink = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download$/i }));

    // First result should have download
    await expect(page.getByText("1 / 3")).toBeVisible();
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });

    // Second result should have download
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });

    // Third result should have download
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("3 / 3")).toBeVisible();
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });
  });

  test("batch process button shows correct file count for different tool", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/compress");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await expect(page.getByText("Files (3)")).toBeVisible();

    // Process button should show 3 files
    const processBtn = page.getByRole("button", { name: /compress.*3 files/i });
    await expect(processBtn).toBeVisible();
  });

  test("batch results preserve file count after processing completes", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    await page.locator("input[placeholder='Auto']").first().fill("50");

    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // File count should still be 2 after processing
    await expect(page.getByText("Files (2)")).toBeVisible();
  });

  test("Download All ZIP contains correct filename", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    await page.getByRole("button", { name: /resize.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click Download All and verify the ZIP download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download all/i }).click();
    const download = await downloadPromise;

    // Verify it is a ZIP file with a meaningful name
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.zip$/i);
    expect(filename.length).toBeGreaterThan(4);
  });
});

// ===========================================================================
// BATCH PROCESSING: undo isolation
// ===========================================================================
test.describe("Batch processing - undo behavior", () => {
  test("undo after batch keeps all files loaded", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    await page.getByRole("button", { name: /resize.*3 files/i }).click();
    await waitForProcessing(page, 30_000);

    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click the result revert control (relabeled "Adjust settings" in 2.0)
    const undoBtn = page.getByRole("button", { name: /adjust settings/i });
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await undoBtn.click();
      await page.waitForTimeout(500);

      // All 3 files should still be present (not cleared)
      await expect(page.getByText("Files (3)")).toBeVisible();

      // Thumbnails should still be visible
      await expect(page.locator("button[title='test-100x100.jpg']")).toBeVisible();
      await expect(page.locator("button[title='test-200x150.png']")).toBeVisible();
      await expect(page.locator("button[title='test-50x50.webp']")).toBeVisible();
    }
  });

  test("after undo, can re-process the batch", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG]);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    // First process
    await page.getByRole("button", { name: /resize.*2 files/i }).click();
    await waitForProcessing(page, 30_000);

    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Revert via "Adjust settings"
    const undoBtn = page.getByRole("button", { name: /adjust settings/i });
    if (await undoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await undoBtn.click();
      await page.waitForTimeout(500);
    }

    // Change settings and re-process
    await page.locator("input[placeholder='Auto']").first().fill("25");

    const processBtn = page.getByRole("button", { name: /resize.*2 files/i });
    if (await processBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await processBtn.click();
      await waitForProcessing(page, 30_000);

      // Results should appear again
      await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});

// ===========================================================================
// MIXED FORMAT BATCH: HEIC inclusion
// ===========================================================================
test.describe("Mixed format batch - HEIC", () => {
  test("JPEG + PNG + WebP + HEIC batch process resize all successfully", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP, FIXTURE_HEIC]);

    await expect(page.getByText("Files (4)")).toBeVisible();

    await page.locator("input[placeholder='Auto']").first().fill("50");

    // Process batch with mixed formats including HEIC
    await page.getByRole("button", { name: /resize.*4 files/i }).click();
    await waitForProcessing(page, 45_000);

    await expect(page.locator("section[aria-label='Preview area'] img").first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate through all 4 results
    await expect(page.getByText("1 / 4")).toBeVisible();
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 4")).toBeVisible();
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("3 / 4")).toBeVisible();
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("4 / 4")).toBeVisible();

    // Download All should work with mixed formats
    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible();
  });

  test("HEIC files show thumbnails in strip alongside other formats", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_HEIC]);

    await expect(page.getByText("Files (2)")).toBeVisible();

    // Both thumbnails should be visible
    await expect(page.locator("button[title='test-100x100.jpg']")).toBeVisible();
    await expect(page.locator("button[title='test-200x150.heic']")).toBeVisible();
  });
});

// ===========================================================================
// PIPELINE BUILDER: step independence and settings
// ===========================================================================
test.describe("Pipeline Builder - step settings independence", () => {
  test("modifying step 1 settings does not affect step 2 settings", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Resize", 2);

    // Expand first Resize step and set width to 100
    const steps = page.locator("[role='button']").filter({ hasText: "Resize" });
    await steps.first().click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    const widthInputs = page.locator("input[placeholder='Auto']");
    if (
      await widthInputs
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false)
    ) {
      await widthInputs.first().fill("100");
    }

    // Collapse first, expand second
    await steps.first().click();
    await page.waitForTimeout(300);
    await steps.nth(1).click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    // Second step's width should still be empty (independent)
    if (
      await widthInputs
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false)
    ) {
      await expect(widthInputs.first()).toHaveValue("");
    }
  });

  test("removing middle step does not clear other steps settings", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);
    await addToolStep(page, "Convert", 3);

    // Expand Resize and set width
    const resizeRow = page.locator("[role='button']").filter({ hasText: "Resize" }).first();
    await resizeRow.click();
    const widthInput = page.locator("input[placeholder='Auto']").first();
    if (await widthInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await widthInput.fill("300");
    }
    await resizeRow.click();
    await page.waitForTimeout(300);

    // Remove the middle step (Compress)
    await page.getByTitle("Remove").nth(1).click();
    await waitForSteps(page, 2);

    // Expand Resize again and verify settings are preserved
    await resizeRow.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });
    if (await widthInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(widthInput).toHaveValue("300");
    }
  });
});

// ===========================================================================
// PIPELINE BUILDER: process button states
// ===========================================================================
test.describe("Pipeline Builder - process button states", () => {
  test("process button disabled with 0 steps and a file", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    // Upload file but no steps
    const testImagePath = getTestImagePath();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(500);

    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeDisabled();
  });

  test("process button enabled after adding step and file", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    // Add step first
    await addToolStep(page, "Compress", 1);

    // Still disabled without file
    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeDisabled();

    // Upload file
    const testImagePath = getTestImagePath();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(500);

    // Now should be enabled
    await expect(processBtn).toBeEnabled();
  });

  test("process button text changes to batch variant for multi-file", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);

    // Upload multiple files
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    // Process button should mention file count
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await expect(processBtn).toBeEnabled();
  });
});

// ===========================================================================
// PIPELINE BUILDER: execution with progress
// ===========================================================================
test.describe("Pipeline Builder - execution progress", () => {
  test("3-step pipeline executes and shows before/after result", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    // Configure each step as it is added (the new step becomes active). Resize
    // needs a dimension and Compress needs a valid mode, otherwise the pipeline
    // rejects the bare defaults (width unset / target size 0).
    await addToolStep(page, "Resize", 1);
    await page.locator("#resize-width").fill("100");
    await addToolStep(page, "Remove Metadata", 2);
    await addToolStep(page, "Compress", 3);
    await page.getByRole("button", { name: "Quality", exact: true }).click();

    // Upload test file
    const testImagePath = getTestImagePath();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(500);

    // Process
    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider to appear
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // Should show Original and Processed labels (exact: the resize step's
    // "Limit to original size" setting also contains "original").
    await expect(page.getByText("Original", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Processed", { exact: true }).first()).toBeVisible();
  });

  test("pipeline execution shows download button in result", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await page.locator("#resize-width").fill("100");
    await addToolStep(page, "Compress", 2);
    await page.getByRole("button", { name: "Quality", exact: true }).click();

    // Upload test file
    const testImagePath = getTestImagePath();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // Download link/button should be visible
    const downloadBtn = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download$/i }));
    await expect(downloadBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ===========================================================================
// PIPELINE BUILDER: save/load preserves step settings
// ===========================================================================
test.describe("Pipeline Builder - Save/Load settings preservation", () => {
  async function cleanupPipelines() {
    const apiUrl = process.env.API_URL || "http://localhost:13490";
    try {
      const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
      });
      const { token } = await loginRes.json();
      const listRes = await fetch(`${apiUrl}/api/v1/pipeline/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { pipelines } = await listRes.json();
      for (const p of pipelines.filter(
        (p: { name: string }) =>
          p.name.startsWith("E2E Workflow") || p.name.startsWith("E2E Settings"),
      )) {
        await fetch(`${apiUrl}/api/v1/pipeline/${p.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Cleanup is best-effort
    }
  }

  test("save pipeline with settings, load it, settings are preserved", async ({
    loggedInPage: page,
  }) => {
    await cleanupPipelines();
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    // Expand Resize step and set width
    const resizeRow = page.locator("[role='button']").filter({ hasText: "Resize" }).first();
    await resizeRow.click();
    const widthInput = page.locator("input[placeholder='Auto']").first();
    if (await widthInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await widthInput.fill("150");
    }
    await resizeRow.click();
    await page.waitForTimeout(300);

    const uniqueName = `E2E Settings ${Date.now()}`;

    // Save pipeline
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByPlaceholder("Pipeline name")).toBeVisible();
    await page.getByPlaceholder("Pipeline name").fill(uniqueName);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({ timeout: 5_000 });

    // The chip should appear
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5_000 });

    // Clear all steps
    while ((await page.getByTitle("Remove").count()) > 0) {
      await page.getByTitle("Remove").first().click();
      await page.waitForTimeout(200);
    }
    await expect(page.getByText("No steps yet")).toBeVisible();

    // Load the saved pipeline by clicking the chip
    await page.getByText(uniqueName).first().click();
    await waitForSteps(page, 2);

    // Expand Resize step and verify width was preserved
    const resizeRowAfter = page.locator("[role='button']").filter({ hasText: "Resize" }).first();
    await resizeRowAfter.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    const widthInputAfter = page.locator("input[placeholder='Auto']").first();
    if (await widthInputAfter.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(widthInputAfter).toHaveValue("150");
    }
  });

  test("saved pipeline chips show step count after loading", async ({ loggedInPage: page }) => {
    await cleanupPipelines();
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);
    await addToolStep(page, "Convert", 3);

    const uniqueName = `E2E Workflow ${Date.now()}`;

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByPlaceholder("Pipeline name").fill(uniqueName);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({ timeout: 5_000 });

    // Chip should be visible
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5_000 });

    // Clear all steps
    while ((await page.getByTitle("Remove").count()) > 0) {
      await page.getByTitle("Remove").first().click();
      await page.waitForTimeout(200);
    }

    // Load the pipeline from chip
    await page.getByText(uniqueName).first().click();
    await waitForSteps(page, 3);

    // Header should show step count
    await expect(page.getByText("3 steps configured")).toBeVisible();
  });
});

// ===========================================================================
// BATCH + PIPELINE: multi-file through pipeline
// ===========================================================================
test.describe("Batch + Pipeline - multi-file workflow", () => {
  test("3 images through 2-step pipeline produces all results", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Remove Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to an invalid Target Size of 0; switch to Quality mode.
    await page.getByRole("button", { name: "Quality", exact: true }).click();

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    await expect(page.getByText("3 files").first()).toBeVisible();

    // Process batch pipeline
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await expect(processBtn).toBeEnabled();
    await processBtn.click();

    await waitForProcessing(page, 45_000);

    // Counter should show results
    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 15_000 });

    // Navigate through all results
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText(/2 \/ 3/).first()).toBeVisible();

    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText(/3 \/ 3/).first()).toBeVisible();
  });

  test("3 images through 2-step pipeline Download All ZIP available", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Remove Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to an invalid Target Size of 0; switch to Quality mode.
    await page.getByRole("button", { name: "Quality", exact: true }).click();

    // Upload 3 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);

    // Process
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await processBtn.click();
    await waitForProcessing(page, 45_000);

    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 60_000 });

    // Download ZIP should be available
    await expect(page.getByRole("button", { name: /download zip/i })).toBeVisible();

    // Clicking it should trigger a download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download zip/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test("2 images through 3-step pipeline processes successfully", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Remove Metadata", 2);
    await addToolStep(page, "Compress", 3);

    // Upload 2 images
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG]);
    await page.waitForTimeout(500);

    await expect(page.getByText("2 files").first()).toBeVisible();

    // Process batch
    const processBtn = page.getByRole("button", { name: /process all.*2/i });
    await processBtn.click();
    await waitForProcessing(page, 45_000);

    // Results should be navigable
    await expect(page.getByText(/1 \/ 2/).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText(/2 \/ 2/).first()).toBeVisible();
  });
});

// ===========================================================================
// CROSS-TOOL FILE CARRYING: additional scenarios
// ===========================================================================
test.describe("Cross-tool file carrying - extended", () => {
  // Removed: "upload on home, click convert from All Tools" and "rotate quick
  // action carries file". The 2.0 home page is a tool catalog (search + tabs +
  // tool-card grid) with no upload dropzone and no All Tools / Quick Actions
  // sections, so the file is now uploaded on a tool page, not the home grid.

  test("navigate away from tool page clears processed state but keeps files in store", async ({
    loggedInPage: page,
  }) => {
    // Upload and process on resize
    await page.goto("/image/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    const processBtn = page.getByRole("button", { name: /resize/i });
    if (await processBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await processBtn.click();
      await waitForProcessing(page, 30_000);
    }

    // Navigate away
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // No stale download links should leak
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });

  test("browser forward after back navigates to correct page", async ({ loggedInPage: page }) => {
    // Start on home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to resize
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Navigate to compress
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // Go back to resize
    await page.goBack();
    await expect(page).toHaveURL("/image/resize");

    // Go forward to compress
    await page.goForward();
    await expect(page).toHaveURL("/image/compress");
  });

  test("direct URL navigation does not carry files from previous tool", async ({
    loggedInPage: page,
  }) => {
    // Upload on resize
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await expect(page.getByText(/test-image/i).first()).toBeVisible();

    // Navigate directly to a different tool
    await page.goto("/image/rotate");
    await page.waitForLoadState("networkidle");

    // No stale processed state
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });
});

// ===========================================================================
// MULTI-FILE + NAVIGATION: previous/next edge cases
// ===========================================================================
test.describe("Multi-file navigation - edge cases", () => {
  test("Previous not visible on first image, Next not visible on last", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/compress");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG]);

    await expect(page.getByText("1 / 2")).toBeVisible();

    // Previous should not be visible on first
    await expect(page.getByRole("button", { name: "Previous file" })).not.toBeVisible();

    // Next should be visible
    await expect(page.getByRole("button", { name: "Next file" })).toBeVisible();

    // Go to last
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();

    // Next should not be visible on last
    await expect(page.getByRole("button", { name: "Next file" })).not.toBeVisible();

    // Previous should be visible
    await expect(page.getByRole("button", { name: "Previous file" })).toBeVisible();
  });

  test("thumbnail click updates counter badge to correct position", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    await expect(page.getByText("1 / 3")).toBeVisible();

    // Click third thumbnail
    await page.locator("button[title='test-50x50.webp']").click();
    await page.waitForTimeout(300);
    await expect(page.getByText("3 / 3")).toBeVisible();

    // Click first thumbnail
    await page.locator("button[title='test-100x100.jpg']").click();
    await page.waitForTimeout(300);
    await expect(page.getByText("1 / 3")).toBeVisible();

    // Click second thumbnail
    await page.locator("button[title='test-200x150.png']").click();
    await page.waitForTimeout(300);
    await expect(page.getByText("2 / 3")).toBeVisible();
  });

  test("selected thumbnail has active styling (outline-primary)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFiles(page, [FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);

    // First thumbnail should be selected by default
    await expect(page.locator("button[title='test-100x100.jpg']")).toHaveClass(/outline-primary/);

    // Click second thumbnail
    await page.locator("button[title='test-200x150.png']").click();
    await page.waitForTimeout(300);

    // Second should now have active styling
    await expect(page.locator("button[title='test-200x150.png']")).toHaveClass(/outline-primary/);

    // First should lose active styling
    await expect(page.locator("button[title='test-100x100.jpg']")).not.toHaveClass(
      /outline-primary/,
    );
  });
});
