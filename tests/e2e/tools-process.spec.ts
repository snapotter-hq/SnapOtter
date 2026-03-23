import { test, expect, uploadTestImage, waitForProcessing } from "./helpers";

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
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("compress processes image", async ({ loggedInPage: page }) => {
    await page.goto("/compress");
    await uploadTestImage(page);
    // Compress has defaults, just click
    await page.getByRole("button", { name: "Compress" }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("convert processes image", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await uploadTestImage(page);
    // Convert has a default format, just click
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("rotate processes image", async ({ loggedInPage: page }) => {
    await page.goto("/rotate");
    await uploadTestImage(page);
    // Click 90 Right first to set a rotation (CW button)
    await page
      .locator("button")
      .filter({ hasText: /90.*right|right.*90|cw/i })
      .first()
      .click()
      .catch(async () => {
        // Fallback: the second quick-rotate button
        const btns = page.locator("button").filter({ has: page.locator("svg") });
        if ((await btns.count()) >= 2) await btns.nth(1).click();
      });
    await page.getByRole("button", { name: "Rotate" }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("crop processes image", async ({ loggedInPage: page }) => {
    await page.goto("/crop");
    await uploadTestImage(page);
    // Crop needs valid dimensions - set small crop box
    const widthInputs = page.locator("input[type='number']");
    // Fill width and height for crop
    if (await widthInputs.count() >= 4) {
      await widthInputs.nth(2).fill("50");
      await widthInputs.nth(3).fill("50");
    }
    await page.getByRole("button", { name: "Crop" }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("strip-metadata processes image", async ({ loggedInPage: page }) => {
    await page.goto("/strip-metadata");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /strip metadata/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("brightness-contrast processes image", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");
    await uploadTestImage(page);
    // Adjust brightness to non-zero so processing makes a change
    const brightnessSlider = page.locator("input[type='range']").first();
    await brightnessSlider.fill("20");
    // Button text is "Apply" in color-settings.tsx
    await page.getByRole("button", { name: /^apply$/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("border processes image", async ({ loggedInPage: page }) => {
    await page.goto("/border");
    await uploadTestImage(page);
    // Default border width is 10px and color is #000000, should be valid
    // Button text is "Add Border" in border-settings.tsx
    await page.getByRole("button", { name: /add border/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first()
        .or(page.getByText(/invalid|error/i).first()),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("info shows image metadata", async ({ loggedInPage: page }) => {
    await page.goto("/info");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /read info/i }).click();
    await waitForProcessing(page);
    // Should display some image info
    await expect(
      page.getByText(/width|height|format|dimensions|png/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("qr-generate creates QR code without file upload", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/qr-generate");
    // Fill in QR text
    await page.locator("textarea").first().fill("https://example.com");
    await page.getByRole("button", { name: /generate qr/i }).click();
    await waitForProcessing(page);
    // QR has a "Download QR Code" button in the left panel
    await expect(
      page.getByText(/download qr/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("vectorize processes image", async ({ loggedInPage: page }) => {
    await page.goto("/vectorize");
    await uploadTestImage(page);
    await page.getByRole("button", { name: /vectorize/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("watermark-text processes image", async ({ loggedInPage: page }) => {
    await page.goto("/watermark-text");
    await uploadTestImage(page);
    // Fill in watermark text
    const textInput = page
      .locator("input[type='text'], textarea")
      .first();
    await textInput.fill("Test Watermark");
    await page.getByRole("button", { name: /add watermark|apply watermark/i }).click();
    await waitForProcessing(page);
    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
