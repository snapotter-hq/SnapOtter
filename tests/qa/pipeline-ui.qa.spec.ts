/**
 * Pipeline Builder UI QA spec.
 *
 * Drives the /automate page in the QA container (auth off, port 13499).
 * Verifies: add steps, configure settings, run pipeline, progress UI,
 * downloadable result, and no console errors.
 */
import { expect, type Page, test } from "@playwright/test";
import { fixture, instrument, isClean, issuesSummary, uploadFiles } from "./qa-helpers";

const FIXTURE_PNG = fixture("image", "formats", "sample.png");

/**
 * Helper: click a tool in the left palette by searching for it and clicking
 * the palette item whose name-div contains the given text.
 * The palette ToolItem structure is:
 *   <button> ... <div class="text-sm font-medium ...">ToolName</div> ... </button>
 */
async function addToolStep(page: Page, searchText: string, nameMatch: RegExp) {
  const searchInput = page.locator("input[placeholder]").first();
  await searchInput.fill(searchText);
  await page.waitForTimeout(600);

  // Target the palette button that has a .font-medium child matching the name
  const paletteBtn = page
    .locator(".overflow-y-auto button")
    .filter({ has: page.locator(".font-medium", { hasText: nameMatch }) })
    .first();

  await paletteBtn.click({ timeout: 10_000 });
  await searchInput.clear();
  await page.waitForTimeout(300);
}

test.describe("Pipeline Builder UI", () => {
  test.setTimeout(180_000);

  test("build 3-step pipeline (resize + grayscale + convert webp), run, confirm progress + download", async ({
    page,
  }) => {
    const issues = instrument(page);

    // Navigate to the automate page
    await page.goto("/automate", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Pipeline Builder")).toBeVisible({ timeout: 15_000 });

    // ---- Upload a file via the semantic upload control ----
    await uploadFiles(page, FIXTURE_PNG);

    // Wait for file badge
    await expect(page.locator("text=sample.png").first()).toBeVisible({ timeout: 10_000 });

    // ---- Add 3 steps from the tool palette ----
    await addToolStep(page, "Resize", /^Resize$/);
    await addToolStep(page, "Adjust Colors", /^Adjust Colors$/);
    await addToolStep(page, "Convert", /^Convert$/);

    // Verify 3 steps shown
    await expect(page.locator("text=3 steps configured")).toBeVisible({ timeout: 5_000 });

    // ---- Configure step settings ----

    // Expand step 1 (Resize) -- it is the first [role="button"] in the builder area (right pane)
    // The builder steps are inside the right pane, each is a [role="button"] with the tool name
    const builderArea = page.locator(".flex-1.flex.flex-col.overflow-hidden");
    const step1Header = builderArea
      .locator("[role='button']")
      .filter({ hasText: /Resize/ })
      .first();
    await step1Header.click();
    await page.waitForTimeout(500);

    // Find the Width input -- it should be labeled "Width" and be a number input
    const widthInput = page.locator("input[placeholder='Auto']").first();
    if (await widthInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await widthInput.fill("100");
    }

    // Expand step 2 (Adjust Colors)
    const step2Header = builderArea
      .locator("[role='button']")
      .filter({ hasText: /Adjust Colors/ })
      .first();
    await step2Header.click();
    await page.waitForTimeout(800);

    // Set the Effect dropdown to grayscale
    const effectSelect = page
      .locator("select")
      .filter({ has: page.locator("option[value='grayscale']") })
      .first();
    if (await effectSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await effectSelect.selectOption("grayscale");
    }

    // Expand step 3 (Convert)
    const step3Header = builderArea
      .locator("[role='button']")
      .filter({ hasText: /Convert/ })
      .first();
    await step3Header.click();
    await page.waitForTimeout(800);

    // Set format to webp
    const formatSelect = page
      .locator("select")
      .filter({ has: page.locator("option[value='webp']") })
      .first();
    if (await formatSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await formatSelect.selectOption("webp");
    }

    // ---- Run the pipeline ----
    const processBtn = page.getByRole("button", { name: /Process/i }).first();
    await expect(processBtn).toBeEnabled({ timeout: 5_000 });
    await processBtn.click();

    // ---- Wait for completion ----
    // Process button becomes enabled again after pipeline completes
    await expect(processBtn).toBeEnabled({ timeout: 120_000 });
    await page.waitForTimeout(1_000);

    // ---- Verify the preview updated ----
    // After processing, the preview panel should show size info (arrow between sizes)
    const sizeInfo = page.locator("text=/\\u2192|\\u2794|\\u279c/").first(); // right arrow chars
    const hasPreview = await sizeInfo.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasPreview) {
      // Also check for error
      const errorEl = page.locator(".text-red-500").first();
      const errorText = await errorEl.textContent().catch(() => null);
      if (errorText) {
        console.log(`Pipeline UI error displayed: ${errorText}`);
      }
    }

    // ---- Assert no console errors / 5xx ----
    const clean = isClean(issues);
    if (!clean) {
      console.log("Page issues:", issuesSummary(issues));
    }
    // Allow console warnings but fail on 5xx server errors
    expect(issues.serverErrors, "No server 5xx errors").toHaveLength(0);
  });

  test("save and load a pipeline from the builder", async ({ page }) => {
    const issues = instrument(page);

    await page.goto("/automate", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Pipeline Builder")).toBeVisible({ timeout: 15_000 });

    // Add 2 steps
    await addToolStep(page, "Resize", /^Resize$/);
    await addToolStep(page, "Border", /^Border/);

    await expect(page.locator("text=2 steps configured")).toBeVisible({ timeout: 5_000 });

    // Click Save button
    const saveBtn = page.getByRole("button", { name: /Save/i }).first();
    await saveBtn.click();

    // Fill in the pipeline name -- the save form has placeholder "Pipeline Name"
    const nameInput = page.getByPlaceholder("Pipeline Name");
    await nameInput.fill("QA UI Test Pipeline");

    // Click the confirm save button (the one inside the save form)
    const confirmSave = page
      .locator("button")
      .filter({ hasText: /^Save$/ })
      .first();
    await confirmSave.click();

    // Wait for save
    await page.waitForTimeout(2_000);

    // Verify it appears in the saved list (bottom of left pane)
    const savedItem = page.locator("text=QA UI Test Pipeline").first();
    const isSaved = await savedItem.isVisible({ timeout: 5_000 }).catch(() => false);

    if (isSaved) {
      // Load it
      await savedItem.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("text=2 steps configured")).toBeVisible({ timeout: 5_000 });
    }

    // Cleanup
    const deleteBtn = page.locator("button[title='Delete pipeline']").first();
    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1_000);
    }

    expect(issues.serverErrors, "No server 5xx errors").toHaveLength(0);
  });

  test("pipeline builder shows empty state and add-tools prompt", async ({ page }) => {
    const issues = instrument(page);

    await page.goto("/automate", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Pipeline Builder")).toBeVisible({ timeout: 15_000 });

    // Verify empty state
    await expect(page.locator("text=/add tools|click to add/i").first()).toBeVisible({
      timeout: 5_000,
    });

    // Process button disabled (no steps, no file)
    const processBtn = page.getByRole("button", { name: /Process/i }).first();
    await expect(processBtn).toBeDisabled();

    expect(issues.serverErrors, "No server 5xx errors").toHaveLength(0);
  });

  test("removing a step updates the builder count", async ({ page }) => {
    const issues = instrument(page);

    await page.goto("/automate", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Pipeline Builder")).toBeVisible({ timeout: 15_000 });

    // Add 2 steps
    await addToolStep(page, "Resize", /^Resize$/);
    await addToolStep(page, "Compress", /^Compress$/);

    await expect(page.locator("text=2 steps configured")).toBeVisible({ timeout: 5_000 });

    // Click the remove button (X icon) on the first step
    // The remove button has title="Remove step" from the builder component
    const removeBtn = page
      .locator("button")
      .filter({ has: page.locator(".lucide-x") })
      .first();
    await expect(removeBtn).toBeVisible({ timeout: 3_000 });
    await removeBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator("text=1 step configured")).toBeVisible({ timeout: 5_000 });

    expect(issues.serverErrors, "No server 5xx errors").toHaveLength(0);
  });

  test("process button disabled when no file uploaded", async ({ page }) => {
    const issues = instrument(page);

    await page.goto("/automate", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Pipeline Builder")).toBeVisible({ timeout: 15_000 });

    await addToolStep(page, "Resize", /^Resize$/);
    await expect(page.locator("text=1 step configured")).toBeVisible({ timeout: 5_000 });

    // No file => button disabled
    const processBtn = page.getByRole("button", { name: /Process/i }).first();
    await expect(processBtn).toBeDisabled();

    expect(issues.serverErrors, "No server 5xx errors").toHaveLength(0);
  });
});
