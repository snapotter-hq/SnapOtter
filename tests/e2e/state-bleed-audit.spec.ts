import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// State-bleed audit: verify that processed state from one tool does NOT
// leak into another tool after navigation.
//
// Bug: navigating from a tool with processed results to a different tool
// shows stale processed state (download buttons, blob: URLs, before/after
// comparisons) in the right pane instead of a clean dropzone.
//
// Root cause hypothesis: the global Zustand file-store is not reset when
// the user navigates between tool routes — the previous tool's entries,
// processedUrl, and blob URLs persist into the next tool's view.
// ---------------------------------------------------------------------------

test.describe("State bleed between tools", () => {
  // ── Core scenario: resize -> rotate ──────────────────────────────────
  test("processed state from resize does NOT appear in rotate", async ({ loggedInPage: page }) => {
    // Step 1: Navigate to resize and process an image
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    // Confirm processed state is present (download link visible)
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Step 2: Navigate to the rotate tool via direct URL
    await page.goto("/rotate");
    await page.waitForLoadState("networkidle");

    // Step 3: The right pane should be in a clean state — dropzone visible
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });

    // Step 4: No stale download link from resize should be present
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();

    // Step 5: No blob: URLs in image elements (would indicate stale processed images)
    const blobImages = page.locator("img[src^='blob:']");
    await expect(blobImages).toHaveCount(0);

    // Step 6: No before/after comparison slider should be visible
    await expect(page.locator("[class*='before-after'], [class*='BeforeAfter']")).not.toBeVisible();
  });

  // ── Reverse direction: rotate -> resize ──────────────────────────────
  test("processed state from rotate does NOT appear in resize", async ({ loggedInPage: page }) => {
    // Process an image in rotate
    await page.goto("/rotate");
    await uploadTestImage(page);

    await page.getByTestId("rotate-right").click();
    await expect(page.locator("input[inputmode='numeric']")).toHaveValue("90", { timeout: 2000 });
    await page.getByTestId("rotate-submit").click();
    await waitForProcessing(page);

    await expect(
      page
        .getByRole("button", { name: /^download$/i })
        .or(page.getByRole("link", { name: /download/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to resize
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    // Should show clean dropzone
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });

  // ── Navigate from dropzone tool to no-dropzone tool (QR Generate) ────
  test("processed state from compress does NOT appear in QR Generate", async ({
    loggedInPage: page,
  }) => {
    // Process an image in compress
    await page.goto("/compress");
    await uploadTestImage(page);
    await page.getByRole("button", { name: "Compress" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to QR Generate (no-dropzone tool)
    await page.goto("/qr-generate");
    await page.waitForLoadState("networkidle");

    // QR Generate should NOT show any file upload state or stale results
    await expect(page.getByText("Upload from computer")).not.toBeVisible();
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();

    // The QR input should be clean and functional
    await expect(page.getByTestId("qr-input-url")).toBeVisible();

    // No stale processed images from compress should be visible
    const blobImages = page.locator("img[src^='blob:']");
    await expect(blobImages).toHaveCount(0);
  });

  // ── Navigate from no-dropzone tool back to dropzone tool ─────────────
  test("QR Generate state does NOT bleed into resize", async ({ loggedInPage: page }) => {
    // Use QR Generate first
    await page.goto("/qr-generate");
    await page.getByTestId("qr-input-url").fill("https://example.com");
    await expect(page.locator("canvas, svg").first()).toBeVisible({ timeout: 5000 });

    // Navigate to resize
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    // Resize should show a clean dropzone
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("QR")).not.toBeVisible();
  });

  // ── Multiple images: upload several files, process, navigate ─────────
  test("multi-file processed state does NOT bleed across tools", async ({ loggedInPage: page }) => {
    // Upload and process in resize
    await page.goto("/resize");
    await uploadTestImage(page);

    // Add a second file by uploading again via the "+ Add more" button
    const addMoreBtn = page.getByText("+ Add more");
    if (await addMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const fileChooserPromise = page.waitForEvent("filechooser");
      await addMoreBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(
        require("node:path").join(process.cwd(), "tests", "fixtures", "test-50x50.webp"),
      );
      await page.waitForTimeout(500);
    }

    // Process all files
    await page.locator("input[placeholder='Auto']").first().fill("25");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to convert
    await page.goto("/convert");
    await page.waitForLoadState("networkidle");

    // Should show clean state — no leftover files or processed results
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();

    // No thumbnail strip from previous multi-file upload
    const thumbnails = page.locator("[aria-label='Previous image'], [aria-label='Next image']");
    await expect(thumbnails).toHaveCount(0);
  });

  // ── Sidebar navigation (not just goto) ───────────────────────────────
  test("sidebar navigation clears processed state", async ({ loggedInPage: page }) => {
    // Process an image in resize
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate home via sidebar
    await page.locator("aside").getByText("Tools").click();
    await expect(page).toHaveURL("/");

    // Home page should show clean dropzone, not stale resize results
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });

  // ── Rapid navigation: process -> navigate -> navigate again ──────────
  test("rapid sequential navigation does not accumulate stale state", async ({
    loggedInPage: page,
  }) => {
    // Process in resize
    await page.goto("/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to rotate, then immediately to compress, then to convert
    await page.goto("/rotate");
    await page.goto("/compress");
    await page.goto("/convert");
    await page.waitForLoadState("networkidle");

    // The final destination (convert) should have a completely clean state
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();

    const blobImages = page.locator("img[src^='blob:']");
    await expect(blobImages).toHaveCount(0);
  });

  // ── Verify processed status text is not carried over ─────────────────
  test("completion indicators from one tool do not appear in another", async ({
    loggedInPage: page,
  }) => {
    // Process in compress (shows size comparison after processing)
    await page.goto("/compress");
    await uploadTestImage(page);
    await page.getByRole("button", { name: "Compress" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to crop
    await page.goto("/crop");
    await page.waitForLoadState("networkidle");

    // Crop should show clean dropzone, no processed-state UI
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });

    // No "Conversion complete" or review-panel artifacts
    await expect(page.getByText("Conversion complete")).not.toBeVisible();

    // No download/undo buttons from compress should remain
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /undo/i })).not.toBeVisible();
  });
});
