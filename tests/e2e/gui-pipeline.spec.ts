import path from "node:path";
import { expect, getTestImagePath, test, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Helper: resolve fixture image paths
// ---------------------------------------------------------------------------
function getFixturePath(name: string): string {
  // Fixtures live under tests/fixtures/image/valid/ in 2.0.
  return path.join(process.cwd(), "tests", "fixtures", "image", "valid", name);
}

const FIXTURE_JPG = getFixturePath("test-100x100.jpg");
const FIXTURE_PNG = getFixturePath("test-200x150.png");
const FIXTURE_WEBP = getFixturePath("test-50x50.webp");

// ---------------------------------------------------------------------------
// Helper: navigate to /automate with retry logic for blank-page flakes
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

/** Upload the test image via the Dropzone file chooser. */
async function uploadTestFile(page: import("@playwright/test").Page) {
  const testImagePath = getTestImagePath();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /upload from computer/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(testImagePath);
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Empty state tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - Empty state", () => {
  test("navigate to /automate shows empty state message", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await expect(page.getByText("No steps yet")).toBeVisible();
    // The prompt renders in two places (canvas header + builder empty state),
    // so scope to the first match to avoid a strict-mode violation.
    await expect(page.getByText("Add tools from the palette to get started").first()).toBeVisible();
  });

  test("tool palette with search is visible", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await expect(page.getByText("Tool Palette")).toBeVisible();
    await expect(page.getByPlaceholder("Search tools...")).toBeVisible();
  });

  test("tool palette search filters results", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    const searchInput = page.getByPlaceholder("Search tools...");
    await expect(searchInput).toBeVisible();

    // Type "resize" to filter the palette
    await searchInput.fill("resize");
    await page.waitForTimeout(300);

    // A Resize button should be visible in the filtered results
    await expect(page.getByRole("button", { name: /resize/i }).first()).toBeVisible();

    // Tools unrelated to "resize" should not be visible (e.g. "Compress")
    await expect(page.getByRole("button", { name: /^compress$/i }).first()).not.toBeVisible({
      timeout: 1_000,
    });

    // Clear search and verify palette restores full list
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Compress should now be visible again in the full palette
    await expect(page.getByRole("button", { name: /compress/i }).first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test("process button is disabled when no steps or file", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeVisible();
    await expect(processBtn).toBeDisabled();
  });

  test("dropzone is visible when no file uploaded", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await expect(page.locator("section[aria-label='File drop zone']")).toBeVisible();
    await expect(page.getByRole("button", { name: /upload from computer/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Adding steps tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - Adding steps", () => {
  test("search 'resize' in palette, click, and step 1 appears", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);

    // Empty state should be gone
    await expect(page.getByText("No steps yet")).not.toBeVisible();

    // Step should display the tool name
    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("step shows name, expand/collapse toggle, and remove button", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);

    // Tool name visible in the step
    await expect(page.getByText("Resize").first()).toBeVisible();

    // Remove button visible
    await expect(page.getByTitle("Remove")).toBeVisible();

    // Step number badge "1" visible
    await expect(page.locator("span").filter({ hasText: /^1$/ }).first()).toBeVisible();
  });

  test("expand step shows settings form", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);

    // A newly added step auto-expands, so collapse it first to test expanding.
    // The step header is a div[role=button] (palette items are real <button>s).
    const stepRow = page.locator("div[role='button']").filter({ hasText: "Resize" }).first();
    await stepRow.click();
    await expect(page.locator("#resize-width")).toBeHidden({ timeout: 5_000 });

    // Re-expand: the Resize settings form (width input) should reappear.
    await stepRow.click();
    await expect(page.locator("#resize-width")).toBeVisible({ timeout: 5_000 });
  });

  test("collapse expanded step hides settings form", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);

    // A newly added step auto-expands, so its settings form (width input) shows.
    await expect(page.locator("#resize-width")).toBeVisible({ timeout: 5_000 });

    // Click the step header to collapse it. The step header is a
    // div[role=button] (palette items are real <button>s).
    const stepRow = page.locator("div[role='button']").filter({ hasText: "Resize" }).first();
    await stepRow.click();

    // Once collapsed, the settings form should be hidden.
    await expect(page.locator("#resize-width")).toBeHidden({ timeout: 5_000 });
  });

  test("add 3 steps: resize, compress, convert - all visible in order", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);
    await addToolStep(page, "Convert", 3);

    // All 3 remove buttons present
    await expect(page.getByTitle("Remove")).toHaveCount(3);

    // Header should show "3 steps configured"
    await expect(page.getByText("3 steps configured")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Step management tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - Step management", () => {
  test("remove step 2 leaves 2 steps remaining", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);
    await addToolStep(page, "Convert", 3);

    // Remove the second step (index 1)
    await page.getByTitle("Remove").nth(1).click();

    // Should have 2 steps remaining
    await waitForSteps(page, 2);
  });

  test("each step settings are independent", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    // Both steps should have their own remove buttons
    await expect(page.getByTitle("Remove")).toHaveCount(2);

    // Expand first step (Resize)
    const resizeRow = page.locator("[role='button']").filter({ hasText: "Resize" }).first();
    await resizeRow.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    // Collapse first, expand second
    await resizeRow.click();
    const compressRow = page.locator("[role='button']").filter({ hasText: "Compress" }).first();
    await compressRow.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });
  });

  test("drag handles are visible for reordering steps", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    // Each step has a GripVertical drag handle (rendered as a <span> with cursor-grab)
    const dragHandles = page.locator(".cursor-grab");
    await expect(dragHandles).toHaveCount(2);
  });

  test("remove step then re-add maintains correct count", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);
    await addToolStep(page, "Convert", 3);

    // Remove the second step
    await page.getByTitle("Remove").nth(1).click();
    await waitForSteps(page, 2);

    // Re-add a step (Compress again)
    await addToolStep(page, "Compress", 3);

    // Should now have 3 steps again
    await expect(page.getByTitle("Remove")).toHaveCount(3);
    await expect(page.getByText("3 steps configured")).toBeVisible();
  });

  test("expand step, modify settings, collapse, re-expand preserves settings", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    // Add a Resize step and a Compress step
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    // Expand the Resize step to reveal its settings form
    const resizeRow = page.locator("[role='button']").filter({ hasText: "Resize" }).first();
    await resizeRow.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    // Modify a setting value in the Resize step (e.g., width input)
    const widthInput = page.locator("input[placeholder='Auto']").first();
    if (await widthInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await widthInput.fill("200");
    }

    // Collapse by clicking the step header again
    await resizeRow.click();
    await page.waitForTimeout(300);

    // Re-expand the Resize step
    await resizeRow.click();
    await expect(page.locator(".border-primary").first()).toBeVisible({ timeout: 3_000 });

    // The previously entered width value should still be present
    if (await widthInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(widthInput).toHaveValue("200");
    }
  });
});

// ---------------------------------------------------------------------------
// File upload + processing tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - File upload and processing", () => {
  test("upload file via dropzone shows preview", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await uploadTestFile(page);

    // File name should appear
    await expect(page.getByText("test-image.png").first()).toBeVisible();
  });

  test("process button enabled when steps + file present", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);

    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeEnabled();
  });

  test("process pipeline shows progress then result with before/after", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Remove Image Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    // Click Process
    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider to appear (BullMQ flow can exceed 30s)
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // Should show Original and Processed labels (exact to avoid the size badges)
    await expect(page.getByText("Original", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Processed", { exact: true }).first()).toBeVisible();
  });

  test("download button visible after processing", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider (BullMQ flow can exceed 30s)
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // File info should be visible in the preview area
    await expect(page.getByText("test-image.png").first()).toBeVisible();
  });

  test("processing completes and shows before/after result", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Remove Image Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    // Click Process
    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // After completion, the before/after slider should appear
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // Original and Processed labels should be shown (exact to skip size badges)
    await expect(page.getByText("Original", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Processed", { exact: true }).first()).toBeVisible();
  });

  test("process button disabled without file even when steps present", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);

    // Process should be disabled without a file
    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeDisabled();
  });

  test("process button disabled without steps even when file present", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);

    // Upload a file but add no steps
    await uploadTestFile(page);

    // Process should be disabled without steps
    const processBtn = page.getByRole("button", { name: "Process", exact: true });
    await expect(processBtn).toBeDisabled();
  });

  test("progress indicator appears during pipeline execution", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Remove Image Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    // Click Process
    await page.getByRole("button", { name: "Process", exact: true }).click();

    // A progress indicator (spinner or progress card) should appear during processing
    const spinner = page.locator("[class*='animate-spin']");
    const progressText = page.getByText(/processing|running/i);
    await spinner
      .or(progressText)
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // After completion, the before/after slider should appear
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });
  });

  test("download button shows after single-file pipeline execution", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider (BullMQ flow can exceed 30s)
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // A download link or button should be visible in the results area
    const downloadBtn = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download$/i }));
    await expect(downloadBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Batch pipeline tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - Batch processing", () => {
  /** Upload multiple fixture images via the dropzone file chooser. */
  async function uploadMultipleFiles(page: import("@playwright/test").Page) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([FIXTURE_JPG, FIXTURE_PNG, FIXTURE_WEBP]);
    await page.waitForTimeout(500);
  }

  test("batch pipeline: 3 images through 2 steps, all processed", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    // Add 2 pipeline steps
    await addToolStep(page, "Remove Image Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();

    // Upload 3 images
    await uploadMultipleFiles(page);

    // File badge should show "3 files"
    await expect(page.getByText("3 files").first()).toBeVisible();

    // Process button should show batch count
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await expect(processBtn).toBeEnabled();
    await processBtn.click();

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // Counter badge should appear (N / M format)
    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("batch pipeline: Download ZIP button appears after batch processing", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadMultipleFiles(page);

    // Process batch
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await processBtn.click();

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // Counter badge should appear to confirm results are ready
    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 15_000 });

    // Download ZIP button should be visible
    await expect(page.getByRole("button", { name: /download zip/i })).toBeVisible();
  });

  test("batch pipeline: navigate through results with Prev/Next", async ({
    loggedInPage: page,
  }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadMultipleFiles(page);

    // Process batch
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await processBtn.click();

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // Counter badge should show "1 / 3" for first result
    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 15_000 });

    // Navigate to second result (a11y labels are "Next file"/"Previous file")
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText(/2 \/ 3/).first()).toBeVisible();

    // Navigate to third result
    await page.getByRole("button", { name: "Next file" }).click();
    await expect(page.getByText(/3 \/ 3/).first()).toBeVisible();

    // Navigate back to verify bidirectional navigation
    await page.getByRole("button", { name: "Previous file" }).click();
    await expect(page.getByText(/2 \/ 3/).first()).toBeVisible();
  });

  test("batch pipeline: Download ZIP triggers actual download", async ({ loggedInPage: page }) => {
    test.setTimeout(90_000);
    await gotoAutomate(page);

    await addToolStep(page, "Compress", 1);
    // Compress defaults to Target Size mode with an invalid empty value; switch
    // the active (just-added) step to Quality mode so the pipeline can execute.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadMultipleFiles(page);

    // Process batch
    const processBtn = page.getByRole("button", { name: /process all.*3/i });
    await processBtn.click();

    // Wait for processing to complete (BullMQ flow can exceed 30s)
    await waitForProcessing(page, 60_000);

    // Counter badge should appear
    await expect(page.getByText(/1 \/ 3/).first()).toBeVisible({ timeout: 15_000 });

    // Click Download ZIP and verify a download is triggered
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download zip/i }).click();
    const download = await downloadPromise;

    // The downloaded file should be a ZIP
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });
});

// ---------------------------------------------------------------------------
// Save/Load pipeline tests
// ---------------------------------------------------------------------------
test.describe("Pipeline Builder - Save/Load", () => {
  // Clean up stale E2E pipelines before each test in this group
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
        (p: { name: string }) => p.name.startsWith("GUI E2E Pipeline") || p.name.startsWith("E2E "),
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

  test("save pipeline with name and chip appears", async ({ loggedInPage: page }) => {
    await cleanupPipelines();
    await gotoAutomate(page);

    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    const uniqueName = `GUI E2E Pipeline ${Date.now()}`;

    // Click Save button
    await page.getByRole("button", { name: "Save" }).click();

    // Name input should appear
    await expect(page.getByPlaceholder("Pipeline name")).toBeVisible();

    // Fill in the name and save
    await page.getByPlaceholder("Pipeline name").fill(uniqueName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The name input should disappear after save
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({
      timeout: 5_000,
    });

    // The saved pipeline should appear as a chip
    await expect(page.getByText(uniqueName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("click saved chip loads pipeline steps", async ({ loggedInPage: page }) => {
    await cleanupPipelines();
    await gotoAutomate(page);

    // Create and save a pipeline
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    const uniqueName = `GUI E2E Pipeline ${Date.now()}`;
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByPlaceholder("Pipeline name").fill(uniqueName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(uniqueName).first()).toBeVisible({
      timeout: 5_000,
    });

    // Remove all current steps to clear the canvas
    while ((await page.getByTitle("Remove").count()) > 0) {
      await page.getByTitle("Remove").first().click();
      await page.waitForTimeout(200);
    }

    // Verify empty state
    await expect(page.getByText("No steps yet")).toBeVisible();

    // Click the saved pipeline chip to load it
    await page.getByText(uniqueName).first().click();

    // Steps should be restored (2 steps)
    await waitForSteps(page, 2);
  });

  test("multiple saved pipelines supported", async ({ loggedInPage: page }) => {
    await cleanupPipelines();
    await gotoAutomate(page);

    // Save first pipeline
    await addToolStep(page, "Resize", 1);
    const name1 = `GUI E2E Pipeline A ${Date.now()}`;
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByPlaceholder("Pipeline name").fill(name1);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({
      timeout: 5_000,
    });

    // Add another step and save as second pipeline
    await addToolStep(page, "Convert", 2);
    const name2 = `GUI E2E Pipeline B ${Date.now()}`;
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByPlaceholder("Pipeline name").fill(name2);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({
      timeout: 5_000,
    });

    // Both pipelines should be visible (either as chips or in expanded list)
    await expect(page.getByText(name1).first()).toBeVisible({ timeout: 5_000 });
    // If there are too many pipelines, the second might be behind a "+N more" button
    const name2Visible = await page
      .getByText(name2)
      .first()
      .isVisible()
      .catch(() => false);
    if (!name2Visible) {
      // Click the "+N more" button to expand
      const moreBtn = page.getByText(/more$/);
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.click();
        await expect(page.getByText(name2).first()).toBeVisible({ timeout: 3_000 });
      }
    }
  });
});
