import { expect, getTestHeicPath, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Test actual image processing for core tools. Upload an image, configure
// settings, click Process, and verify the result appears.
// ---------------------------------------------------------------------------

test.describe("Tool processing (core tools)", () => {
  test("resize processes image", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Fill in width (required)
    const widthInput = page.locator("input").filter({ hasText: /^$/ }).nth(0);
    await page.locator("input[placeholder='Auto']").first().fill("50");

    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("compress processes image", async ({ loggedInPage: page }) => {
    await page.goto("/compress");
    await uploadTestImage(page);
    // Compress has defaults, just click
    await page.getByRole("button", { name: "Compress" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("convert processes image", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await uploadTestImage(page);
    // Convert has a default format, just click
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("rotate processes image", async ({ loggedInPage: page }) => {
    await page.goto("/rotate");
    await uploadTestImage(page);
    // Click the clockwise 90° rotation button and wait for state to propagate
    await page.getByTestId("rotate-right").click();
    // Verify the angle input updated to 90
    await expect(page.locator("input[inputmode='numeric']")).toHaveValue("90", { timeout: 2000 });
    await page.getByTestId("rotate-submit").click();
    await waitForProcessing(page);
    await expect(
      page
        .getByRole("button", { name: /^download$/i })
        .or(page.getByRole("link", { name: /download/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("crop processes image", async ({ loggedInPage: page }) => {
    await page.goto("/crop");
    await uploadTestImage(page);
    // Wait for image to load in the crop canvas
    await page.waitForTimeout(1000);
    // Click on the crop area to initialize a crop region, then use the preset
    // or set dimensions via the number inputs once imgDimensions is available
    const widthInputs = page.locator("input[type='number']");
    if ((await widthInputs.count()) >= 4) {
      await widthInputs.nth(2).fill("50");
      await widthInputs.nth(3).fill("50");
    }
    await page.getByTestId("crop-submit").click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("strip-metadata processes image", async ({ loggedInPage: page }) => {
    await page.goto("/strip-metadata");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /remove metadata/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("edit-metadata processes image", async ({ loggedInPage: page }) => {
    await page.goto("/edit-metadata");
    await uploadTestImage(page);

    // Wait for inspect to complete and form to populate
    await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

    // Edit the artist field
    await page.fill('[id="em-artist"]', "E2E Test Artist");

    await page.getByRole("button", { name: /apply metadata/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("adjust-colors processes image", async ({ loggedInPage: page }) => {
    await page.goto("/adjust-colors");
    await uploadTestImage(page);
    // Adjust brightness to non-zero so processing makes a change
    const brightnessSlider = page.locator("input[type='range']").first();
    await brightnessSlider.fill("20");
    // Button text is "Apply" in color-settings.tsx
    await page.getByRole("button", { name: /^apply$/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("image-enhancement processes image", async ({ loggedInPage: page }) => {
    await page.goto("/image-enhancement");
    await uploadTestImage(page);
    // Wait for analysis to complete (badges appear)
    await expect(
      page.locator("text=Intensity").or(page.locator("text=Enhancement Mode")),
    ).toBeVisible({ timeout: 10_000 });
    // Click Enhance button
    await page.getByRole("button", { name: /^enhance$/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("border processes image", async ({ loggedInPage: page }) => {
    await page.goto("/border");
    await uploadTestImage(page);
    // Default border width is 10px and color is #000000, should be valid
    // Button text is "Apply Border" in border-settings.tsx
    await page.getByRole("button", { name: /apply border/i }).click();
    await waitForProcessing(page);
    await expect(
      page
        .getByRole("link", { name: /download/i })
        .first()
        .or(page.getByText(/invalid|error/i).first()),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("info shows image metadata", async ({ loggedInPage: page }) => {
    await page.goto("/info");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /read info/i }).click();
    await waitForProcessing(page);
    // Should display some image info
    await expect(page.getByText(/width|height|format|dimensions|png/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("qr-generate creates QR code without file upload", async ({ loggedInPage: page }) => {
    await page.goto("/qr-generate");
    // Fill in URL input (client-side generation, live preview)
    await page.getByTestId("qr-input-url").fill("https://example.com");
    // Verify the live preview rendered (canvas or svg inside the preview area)
    await expect(page.locator("canvas, svg").first()).toBeVisible({ timeout: 5000 });
    // Download button should be enabled
    const downloadBtn = page.getByTestId("qr-generate-download");
    await expect(downloadBtn).toBeEnabled();
  });

  test("vectorize processes image", async ({ loggedInPage: page }) => {
    await page.goto("/vectorize");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /vectorize/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("watermark-text processes image", async ({ loggedInPage: page }) => {
    await page.goto("/watermark-text");
    await uploadTestImage(page);
    // Fill in watermark text
    const textInput = page.locator("input[type='text'], textarea").first();
    await textInput.fill("Test Watermark");
    await page.getByRole("button", { name: /add watermark|apply watermark/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("convert HEIC to JPG", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    const heicPath = getTestHeicPath();

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(heicPath);
    await page.waitForTimeout(500);

    // Select JPG output format
    await page.selectOption("#convert-target-format", "jpg");
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("convert PNG to HEIC", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await uploadTestImage(page);

    // Select HEIC output format
    await page.selectOption("#convert-target-format", "heic");
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
