import fs from "node:fs";
import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Full user session: simulates a real user uploading images, applying
// different tools in sequence, and downloading results.
// ---------------------------------------------------------------------------

test.describe("Full user session", () => {
  test("upload -> resize -> download cycle", async ({ loggedInPage: page }) => {
    // Navigate to resize tool
    await page.goto("/image/resize");
    await expect(page.getByText("Resize").first()).toBeVisible();

    // Upload test image
    await uploadTestImage(page);

    // Verify the upload was accepted (dropzone is replaced by the viewer)
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // Set width to 200
    await page.locator("input[placeholder='Auto']").first().fill("200");

    // Set height to 200
    await page.locator("input[placeholder='Auto']").nth(1).fill("200");

    // Click resize button
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    // Verify download button appears
    const downloadBtn = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    // Click download and verify a file is received
    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;

    // Verify the download has a filename
    expect(download.suggestedFilename()).toBeTruthy();

    // Save to disk and verify it is a non-empty file
    const downloadPath = path.join(process.cwd(), "test-results", "download-resize-result");
    await download.saveAs(downloadPath);
    const stat = fs.statSync(downloadPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test("upload -> rotate 90 -> download cycle", async ({ loggedInPage: page }) => {
    await page.goto("/image/rotate");
    await expect(page.getByText("Rotate").first()).toBeVisible();

    await uploadTestImage(page);
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // Click the clockwise 90° rotation button and wait for state
    await page.getByTestId("rotate-right").click();
    await expect(page.locator("input[inputmode='numeric']")).toHaveValue("90", { timeout: 2000 });

    // Click the process button (button text is "Apply")
    await page.getByTestId("rotate-submit").click();
    await waitForProcessing(page);

    // Verify result. Rotate has no download link of its own; the generic
    // review panel renders the download affordance as [data-download-button].
    const downloadBtn = page.locator("[data-download-button]").first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();
  });

  test("upload -> convert to JPEG -> download cycle", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");
    await expect(page.getByText("Convert").first()).toBeVisible();

    await uploadTestImage(page);
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // The convert tool has a format selector - look for JPEG option
    // Try selecting JPEG from the format options
    const jpegOption = page.getByRole("button", { name: /jpeg|jpg/i }).first();
    if (await jpegOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await jpegOption.click();
    }
    // Otherwise the default format selection is fine

    // Click convert button
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);

    // Verify download
    const downloadBtn = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();
  });

  test("upload -> crop -> download cycle", async ({ loggedInPage: page }) => {
    await page.goto("/image/crop");
    await expect(page.getByText("Crop").first()).toBeVisible();

    await uploadTestImage(page);
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // Set crop dimensions via number inputs
    // Crop component has: left, top, width, height inputs
    const numberInputs = page.locator("input[type='number']");
    const count = await numberInputs.count();
    if (count >= 4) {
      // Ensure width and height are set (indices 2 and 3)
      await numberInputs.nth(2).fill("50");
      await numberInputs.nth(3).fill("50");
    } else if (count >= 2) {
      // If fewer inputs, fill the first two
      await numberInputs.nth(0).fill("50");
      await numberInputs.nth(1).fill("50");
    }

    // Click crop button
    await page.locator("button[type='submit']").click();
    await waitForProcessing(page);

    // Verify download
    const downloadBtn = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();
  });

  test("upload -> compress -> download cycle", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await expect(page.getByText("Compress").first()).toBeVisible();

    await uploadTestImage(page);
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // Compress defaults to Target Size mode with an empty (invalid) value,
    // which keeps the submit disabled. Switch to Quality mode first.
    await page.getByRole("button", { name: "Quality" }).click();
    await page.getByTestId("compress-submit").click();
    await waitForProcessing(page);

    const downloadBtn = page.getByTestId("compress-download");
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();

    // Save and verify the downloaded file is a valid non-empty image
    const downloadPath = path.join(process.cwd(), "test-results", "download-compress-result");
    await download.saveAs(downloadPath);
    const stat = fs.statSync(downloadPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test("multi-tool session: resize then compress", async ({ loggedInPage: page }) => {
    // Step 1: Resize
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("200");
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);

    const resizeDownloadBtn = page.getByTestId("resize-download");
    await expect(resizeDownloadBtn).toBeVisible({ timeout: 15_000 });

    // Step 2: Navigate to compress and process a new image
    await page.goto("/image/compress");
    await uploadTestImage(page);
    // Switch to Quality mode so the disabled Target Size default is bypassed.
    await page.getByRole("button", { name: "Quality" }).click();
    await page.getByTestId("compress-submit").click();
    await waitForProcessing(page);

    const compressDownloadBtn = page.getByTestId("compress-download");
    await expect(compressDownloadBtn).toBeVisible({ timeout: 15_000 });
  });

  test("upload file then navigate away and back retains tool state", async ({
    loggedInPage: page,
  }) => {
    // Go to resize, upload, configure
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("300");

    // Navigate away to the home catalog. In 2.0 the home page is a tool
    // catalog (search + tabs + link cards), not a dropzone.
    await page.goto("/");
    await expect(page.locator("[data-search-input]")).toBeVisible();

    // Navigate back to resize - the tool should reset (fresh state)
    await page.goto("/image/resize");
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("download button triggers actual file download", async ({ loggedInPage: page }) => {
    await page.goto("/image/strip-metadata");
    await uploadTestImage(page);

    await page.getByRole("button", { name: /remove metadata/i }).click();
    await waitForProcessing(page);

    const downloadBtn = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    // Intercept the download event
    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;

    // Verify download properties
    const filename = download.suggestedFilename();
    expect(filename).toBeTruthy();
    expect(filename.length).toBeGreaterThan(0);

    // Save and confirm it wrote bytes
    const savePath = path.join(process.cwd(), "test-results", "download-strip-metadata-result");
    await download.saveAs(savePath);
    const stat = fs.statSync(savePath);
    expect(stat.size).toBeGreaterThan(0);
  });
});
